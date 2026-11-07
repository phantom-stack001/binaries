import type { Context, Hono } from "hono";

import { accessDeniedMessage } from "../lib/brand.js";
import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { validationError } from "../lib/http-errors.js";
import { parseRoleKeys, type PermissionKey } from "../auth/permissions.js";
import { resolveRecipientOwnerId } from "../lib/org-workspace.js";
import { getSessionUser } from "../lib/session.js";
import { userHasPermission } from "../services/access-control.js";
import { loadActiveMailConfig, getMailProviderSettings, setMailProvider } from "../services/mail-provider.js";
import { MailboxError, publicSmtpCode } from "../mail/errors.js";
import {
  listMailboxFolders,
  listMailboxMessages,
  listSentMessages,
  readMailboxMessage,
} from "../mail/imap.js";
import { getMailboxStatus, testMailboxConnection } from "../services/mail-connection.js";
import { sendControlledTest } from "../services/mail-test-send.js";
import { listDesignatedTestLists, sendDesignatedTestList } from "../services/test-list-send.js";
import { rejectsClientRecipientBatch, testMessageListRecipientLimit } from "../services/test-list-plan.js";
import { sendIndividualEmail } from "../services/individual-send.js";
import { listIndividualSubmissions } from "../services/individual-send-records.js";
import { toPublicIndividualSend } from "../mail/individual-send-public.js";
import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import { clientIpFromRequest, userAgentFromRequest } from "../lib/request-context.js";
import { recordAuditEvent } from "../services/audit-log.js";
import { mailboxFolderSchema, mailPageQuerySchema, mailUidSchema, testSendSchema, individualSendSchema, individualSendListQuerySchema } from "../validation/mail.js";

const env = loadEnv();
const db = createLiveDb(env);

/**
 * Direct mailbox access for the configured account.
 * Campaign queues are not used by these routes.
 */
function json(c: Context, body: unknown, status: 200 | 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503 = 200) {
  c.header("Cache-Control", "no-store");
  return c.json(body, status);
}

async function requireMailbox(c: Context, permission: PermissionKey) {
  const user = await getSessionUser(c.req.raw.headers);
  if (!user) {
    return { response: json(c, { error: "Unauthorized" }, 401) };
  }
  if ((user as { banned?: boolean | null }).banned) {
    return { response: json(c, { error: accessDeniedMessage() }, 403) };
  }
  const allowed = await userHasPermission(db, user, permission);
  if (!allowed) {
    return { response: json(c, { error: "You do not have permission to use the mailbox." }, 403) };
  }
  return { user };
}

async function requireSuperAdmin(c: Context) {
  const account = await getSessionUser(c.req.raw.headers);
  if (!account || (account as { banned?: boolean | null }).banned) {
    return { response: json(c, { error: "Unauthorized" }, account ? 403 : 401) };
  }
  if (!parseRoleKeys(account.role).includes("super-admin")) {
    return { response: json(c, { error: "Only a super admin can change the outbound email provider." }, 403) };
  }
  return { user: account };
}

function pageQuery(c: Context) {
  return mailPageQuerySchema.safeParse({
    page: c.req.query("page") ?? "1",
    limit: c.req.query("limit") ?? "25",
  });
}

async function loadConfiguredMail() {
  return (await loadActiveMailConfig(db)).loaded;
}

export function registerMailRoutes(app: Hono) {
  app.get("/api/mail/provider", async (c) => {
    const access = await requireSuperAdmin(c);
    if ("response" in access) return access.response;
    return json(c, await getMailProviderSettings(db, env));
  });

  app.put("/api/mail/provider", async (c) => {
    const access = await requireSuperAdmin(c);
    if ("response" in access) return access.response;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return json(c, { error: "Invalid JSON body" }, 400);
    }
    if (!body || typeof body !== "object" || !("provider" in body)) {
      return json(c, { error: "Choose Resend or Spacemail." }, 400);
    }
    const provider = (body as { provider?: unknown }).provider;
    if (provider !== "resend" && provider !== "spacemail") {
      return json(c, { error: "Choose Resend or Spacemail." }, 400);
    }
    const settings = await getMailProviderSettings(db, env);
    if (!settings.availability[provider]) {
      return json(c, {
        error: `${provider === "resend" ? "Resend" : "Spacemail SMTP"} credentials are not configured on the server.`,
      }, 400);
    }
    return json(c, await setMailProvider(db, env, provider, access.user.id));
  });

  app.get("/api/mail/status", async (c) => {
    const access = await requireMailbox(c, "mailbox.read");
    if ("response" in access) return access.response;
    const status = await getMailboxStatus(db);
    return json(c, status);
  });

  app.post("/api/mail/test-connection", async (c) => {
    const access = await requireMailbox(c, "mailbox.manage_connection");
    if ("response" in access) return access.response;
    const result = await testMailboxConnection(db, access.user.id);
    if (result.kind === "not_configured") {
      return json(c, { error: "Email account is not configured on the server." }, 503);
    }
    if (result.kind === "rate_limited") {
      return json(c, { error: "Wait a few seconds before testing the connection again." }, 429);
    }
    return json(c, result.status);
  });

  app.get("/api/mail/test-send-context", async (c) => {
    const access = await requireMailbox(c, "mailbox.send_test");
    if ("response" in access) return access.response;
    const status = await getMailboxStatus(db);
    return json(c, {
      configured: status.configured,
      testRecipients: status.testRecipients,
    });
  });

  app.get("/api/mail/test-lists", async (c) => {
    const access = await requireMailbox(c, "mailbox.send_test");
    if ("response" in access) return access.response;
    const lists = await listDesignatedTestLists(db);
    return json(c, { lists, limit: testMessageListRecipientLimit() });
  });

  app.post("/api/mail/test-send", async (c) => {
    const requestStartedAt = Date.now();
    const logPhase = (phase: string) => {
      console.info(`[mail-test] phase=${phase} elapsedMs=${Date.now() - requestStartedAt}`);
    };
    logPhase("started");
    const access = await requireMailbox(c, "mailbox.send_test");
    logPhase("authorization_complete");
    if ("response" in access) return access.response;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return json(c, { error: "Invalid JSON body" }, 400);
    }
    if (rejectsClientRecipientBatch(body)) {
      return json(c, { error: "Choose one recipient or a designated test list." }, 400);
    }

    const parsed = testSendSchema.safeParse(body);
    if (!parsed.success) {
      return json(c, validationError(parsed.error), 400);
    }
    logPhase("request_validated");

    if (parsed.data.recipientMode === "test_list") {
      try {
        const outcome = await sendDesignatedTestList(
          db,
          access.user.id,
          {
            subject: parsed.data.subject,
            text: parsed.data.text,
            html: parsed.data.html,
            idempotencyKey: parsed.data.idempotencyKey,
            testListId: parsed.data.testListId ?? "",
          },
          {
            actorEmail: access.user.email,
            ipAddress: clientIpFromRequest(c),
            userAgent: userAgentFromRequest(c),
          },
          access.user.role,
        );
        logPhase("test_list_send_complete");
        if (outcome.kind === "not_configured") {
          return json(c, { error: "Email account is not configured on the server.", code: "smtp_unavailable" }, 503);
        }
        if (outcome.kind === "not_found") {
          return json(c, { error: "That test list could not be found.", code: "test_list_not_found" }, 404);
        }
        if (outcome.kind === "not_test_list") {
          return json(c, { error: "Only a list marked as a test list can be used.", code: "test_list_not_enabled" }, 400);
        }
        if (outcome.kind === "none_eligible") {
          return json(
            c,
            {
              error: "This test list does not currently contain any eligible recipients.",
              code: "test_list_no_eligible_recipients",
              requested: outcome.requested,
              suppressed: outcome.suppressed,
              skipped: outcome.skipped,
            },
            400,
          );
        }
        if (outcome.kind === "over_limit") {
          return json(
            c,
            {
              error: `This test list has ${outcome.eligible} eligible recipients. Test sends are limited to ${outcome.limit}.`,
              code: "test_list_too_large",
              eligible: outcome.eligible,
              limit: outcome.limit,
            },
            400,
          );
        }
        if (outcome.kind === "rate_limited") {
          return json(c, { error: outcome.message, code: "test_send_rate_limited" }, 429);
        }
        return json(c, {
          summary: outcome.summary,
          results: outcome.results.map((result) => ({
            email: result.email,
            outcome: result.outcome === "accepted" ? "smtp_accepted" : result.outcome,
          })),
          duplicate: outcome.kind === "duplicate",
        });
      } catch (error) {
        logPhase("test_list_send_failed");
        if (error instanceof MailboxError) {
          return json(c, { error: error.message, code: publicSmtpCode(error) }, error.status);
        }
        console.error(
          "[mail] test list send failed",
          error instanceof Error ? error.name : "error",
        );
        return json(
          c,
          { error: "The test message could not be sent.", code: "test_send_failed" },
          502,
        );
      }
    }

    if (!parsed.data.testRecipient) {
      return json(c, { error: "Choose an authorized test recipient." }, 400);
    }

    try {
      const outcome = await sendControlledTest(db, access.user.id, {
        subject: parsed.data.subject,
        text: parsed.data.text,
        html: parsed.data.html,
        idempotencyKey: parsed.data.idempotencyKey,
        testRecipient: parsed.data.testRecipient,
      });
      logPhase("single_send_complete");
      if (outcome.kind === "not_configured") {
        return json(c, { error: "Email account is not configured on the server." }, 503);
      }
      if (outcome.kind === "in_progress") {
        return json(c, { error: "A test message is already being sent." }, 409);
      }
      if (outcome.kind === "rate_limited") {
        return json(c, { error: outcome.message }, 429);
      }
      if (outcome.kind === "duplicate") {
        return json(c, { submission: outcome.submission, duplicate: true });
      }
      if (outcome.kind === "accepted") {
        return json(c, { submission: outcome.submission, duplicate: false });
      }
      return json(
        c,
        {
          error: outcome.submission.errorMessage ?? "The message was not accepted.",
          submission: outcome.submission,
        },
        502,
      );
    } catch (error) {
      logPhase("single_send_failed");
      if (error instanceof MailboxError) {
        return json(c, { error: error.message }, error.status);
      }
      throw error;
    }
  });

  app.get("/api/mail/sends", async (c) => {
    const access = await requireMailbox(c, "mailbox.send");
    if ("response" in access) return access.response;
    const parsed = individualSendListQuerySchema.safeParse({
      page: c.req.query("page") ?? "1",
      limit: c.req.query("limit") ?? "10",
    });
    if (!parsed.success) return json(c, validationError(parsed.error), 400);
    const { rows, total } = await listIndividualSubmissions(
      db,
      access.user.id,
      parsed.data.page,
      parsed.data.limit,
    );
    return json(c, {
      submissions: rows.map((row) => toPublicIndividualSend(row)),
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / parsed.data.limit)),
      },
    });
  });

  app.post("/api/mail/send", async (c) => {
    const access = await requireMailbox(c, "mailbox.send");
    if ("response" in access) return access.response;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return json(c, { error: "Invalid JSON body" }, 400);
    }
    const parsed = individualSendSchema.safeParse(body);
    if (!parsed.success) return json(c, validationError(parsed.error), 400);

    const outcome = await sendIndividualEmail(
      db,
      access.user.id,
      {
        ...parsed.data,
        draftId: parsed.data.draftId ?? null,
      },
      { recipientOwnerId: resolveRecipientOwnerId(access.user) },
    );

    const auditCtx = {
      ipAddress: clientIpFromRequest(c),
      userAgent: userAgentFromRequest(c),
    };
    const recipientCount =
      parsed.data.to.length + parsed.data.cc.length + parsed.data.bcc.length;
    if (outcome.kind === "accepted" || outcome.kind === "rejected" || outcome.kind === "failed" || outcome.kind === "uncertain") {
      const action =
        outcome.kind === "accepted"
          ? AUDIT_ACTIONS.emailSmtpAccepted
          : outcome.kind === "rejected"
            ? AUDIT_ACTIONS.emailSmtpRejected
            : AUDIT_ACTIONS.emailSmtpFailed;
      try {
        await recordAuditEvent(db, {
          action,
          category: "EMAIL",
          actorUserId: access.user.id,
          actorEmail: access.user.email,
          resourceType: "email_submission",
          resourceId: outcome.submission.id,
          result: outcome.kind === "accepted" ? "success" : "failure",
          metadata: {
            recipientCount,
            status: outcome.submission.status,
            errorCode: outcome.submission.errorCode ?? null,
          },
          requestContext: auditCtx,
        });
      } catch (error) {
        console.error("[audit] mail send", error instanceof Error ? error.message : "unknown");
      }
    } else if (outcome.kind !== "not_configured" && outcome.kind !== "invalid" && outcome.kind !== "forbidden_draft" && outcome.kind !== "rate_limited") {
      try {
        await recordAuditEvent(db, {
          action: AUDIT_ACTIONS.emailSendRequested,
          category: "EMAIL",
          actorUserId: access.user.id,
          resourceType: "email_submission",
          resourceId: outcome.submission.id,
          metadata: { recipientCount, duplicate: outcome.kind === "duplicate" },
          requestContext: auditCtx,
        });
      } catch {
        /* non-blocking */
      }
    }
    if (outcome.kind === "not_configured") {
      return json(c, { error: "Email account is not configured on the server." }, 503);
    }
    if (outcome.kind === "invalid") return json(c, { error: outcome.message }, 400);
    if (outcome.kind === "forbidden_draft") return json(c, { error: "Draft not found." }, 404);
    if (outcome.kind === "rate_limited") return json(c, { error: outcome.message }, 429);
    if (outcome.kind === "in_progress") {
      return json(c, { error: "This message is already being sent.", submission: outcome.submission }, 409);
    }
    if (outcome.kind === "duplicate") {
      return json(c, { submission: outcome.submission, duplicate: true });
    }
    if (outcome.kind === "accepted") {
      return json(c, { submission: outcome.submission, duplicate: false });
    }
    if (outcome.kind === "uncertain") {
      return json(c, { error: outcome.submission.note, submission: outcome.submission }, 409);
    }
    return json(
      c,
      { error: outcome.submission.errorMessage ?? outcome.submission.note, submission: outcome.submission },
      502,
    );
  });

  app.get("/api/mail/folders", async (c) => {
    const access = await requireMailbox(c, "mailbox.read");
    if ("response" in access) return access.response;
    const loaded = await loadConfiguredMail();
    if (!loaded.ok) {
      console.error("[mail] configuration unavailable", loaded.reason);
      return json(c, { error: "Email account is not configured on the server." }, 503);
    }
    if (!loaded.config.imapConfigured) {
      return json(c, { error: "Incoming mailbox credentials are not configured on the server." }, 503);
    }
    try {
      const folders = await listMailboxFolders(loaded.config);
      return json(c, { folders });
    } catch (error) {
      if (error instanceof MailboxError) {
        return json(c, { error: error.message }, error.status);
      }
      throw error;
    }
  });

  app.get("/api/mail/inbox", async (c) => {
    const access = await requireMailbox(c, "mailbox.read");
    if ("response" in access) return access.response;
    const page = pageQuery(c);
    if (!page.success) {
      return json(c, validationError(page.error), 400);
    }
    const loaded = await loadConfiguredMail();
    if (!loaded.ok) {
      console.error("[mail] configuration unavailable", loaded.reason);
      return json(c, { error: "Email account is not configured on the server." }, 503);
    }
    if (!loaded.config.imapConfigured) {
      return json(c, { error: "Incoming mailbox credentials are not configured on the server." }, 503);
    }
    try {
      const result = await listMailboxMessages(
        loaded.config,
        "INBOX",
        page.data.page,
        page.data.limit,
      );
      return json(c, result);
    } catch (error) {
      if (error instanceof MailboxError) {
        return json(c, { error: error.message }, error.status);
      }
      throw error;
    }
  });

  app.get("/api/mail/sent", async (c) => {
    const access = await requireMailbox(c, "mailbox.read");
    if ("response" in access) return access.response;
    const page = pageQuery(c);
    if (!page.success) {
      return json(c, validationError(page.error), 400);
    }
    const loaded = await loadConfiguredMail();
    if (!loaded.ok) {
      console.error("[mail] configuration unavailable", loaded.reason);
      return json(c, { error: "Email account is not configured on the server." }, 503);
    }
    if (!loaded.config.imapConfigured) {
      return json(c, { error: "Incoming mailbox credentials are not configured on the server." }, 503);
    }
    try {
      const result = await listSentMessages(loaded.config, page.data.page, page.data.limit);
      return json(c, result);
    } catch (error) {
      if (error instanceof MailboxError) {
        return json(c, { error: error.message }, error.status);
      }
      throw error;
    }
  });

  app.get("/api/mail/mailbox", async (c) => {
    const access = await requireMailbox(c, "mailbox.read");
    if ("response" in access) return access.response;
    const folder = mailboxFolderSchema.safeParse(c.req.query("folder") ?? "");
    if (!folder.success) {
      return json(c, { error: "That mailbox folder is not available." }, 404);
    }
    const page = pageQuery(c);
    if (!page.success) {
      return json(c, validationError(page.error), 400);
    }
    const loaded = await loadConfiguredMail();
    if (!loaded.ok) {
      console.error("[mail] configuration unavailable", loaded.reason);
      return json(c, { error: "Email account is not configured on the server." }, 503);
    }
    if (!loaded.config.imapConfigured) {
      return json(c, { error: "Incoming mailbox credentials are not configured on the server." }, 503);
    }
    try {
      const result = await listMailboxMessages(
        loaded.config,
        folder.data,
        page.data.page,
        page.data.limit,
      );
      return json(c, result);
    } catch (error) {
      if (error instanceof MailboxError) {
        return json(c, { error: error.message }, error.status);
      }
      throw error;
    }
  });

  app.get("/api/mail/messages/:uid", async (c) => {
    const access = await requireMailbox(c, "mailbox.read");
    if ("response" in access) return access.response;
    const uid = mailUidSchema.safeParse(c.req.param("uid"));
    const folder = mailboxFolderSchema.safeParse(c.req.query("folder") ?? "");
    if (!uid.success || !folder.success) {
      return json(c, { error: "That message could not be found." }, 404);
    }
    const loaded = await loadConfiguredMail();
    if (!loaded.ok) {
      console.error("[mail] configuration unavailable", loaded.reason);
      return json(c, { error: "Email account is not configured on the server." }, 503);
    }
    if (!loaded.config.imapConfigured) {
      return json(c, { error: "Incoming mailbox credentials are not configured on the server." }, 503);
    }
    try {
      const message = await readMailboxMessage(loaded.config, folder.data, Number(uid.data));
      return json(c, { message });
    } catch (error) {
      if (error instanceof MailboxError) {
        return json(c, { error: error.message }, error.status);
      }
      throw error;
    }
  });
}
