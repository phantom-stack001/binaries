import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";

import { auth } from "./auth/auth.js";
import { authTrustedOrigins } from "./auth/origins.js";
import { permissionForRequest } from "./auth/permissions.js";
import { AUDIT_ACTIONS } from "./lib/audit-taxonomy.js";
import { createDb, getDb, probeDatabase, type Database } from "./db/index.js";
import { appUserRoles, user } from "./db/schema.js";
import type { ServerEnv } from "./env.js";
import { loadEnv } from "./env.js";
import { accessDeniedMessage } from "./lib/brand.js";
import { runWithAuditRequestContext } from "./lib/audit-request-context.js";
import {
  captureDatabaseFailures,
  DatabaseUnavailableError,
  peekDatabaseFailure,
  publicApiError,
} from "./lib/db-errors.js";
import { withDatabaseDeadline } from "./lib/database-deadline.js";
import { auditRequestContextFromHeaders } from "./lib/request-context.js";
import { logStartup, safeErrorLabel } from "./lib/startup-log.js";
import { getSessionUser } from "./lib/session.js";
import { canDeleteSystemData } from "./lib/org-workspace.js";
import { publicRegistrationSchema } from "./validation/admin-users.js";
import { claimSignupCode, releaseSignupCodeClaim } from "./services/signup-codes.js";
import { recordAudit } from "./services/audit-log.js";
import { probeRedis } from "./queue/connection.js";
import {
  isApiPathAllowedDuringPasswordChange,
  isApiPathAllowedDuringTwoFactorSetup,
  loadAccountSecurityState,
} from "./lib/account-security.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { recordAccessDeniedAudit } from "./services/access-denied-audit.js";
import { recordApiMutationAudit } from "./services/api-mutation-audit.js";
import { recordAuthHandlerAudit } from "./services/auth-event-audit.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerContactImportRoutes } from "./routes/contact-import.js";
import { registerContactListRoutes } from "./routes/contact-lists.js";
import { registerContactRoutes } from "./routes/contacts.js";
import { registerDraftRoutes } from "./routes/drafts.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMailRoutes } from "./routes/mail.js";
import { registerQueueRoutes } from "./routes/queue.js";
import { registerSuppressionRoutes } from "./routes/suppressions.js";
import { seedAccessControl, userHasPermission } from "./services/access-control.js";

export type SendStackApp = {
  app: Hono;
  db: Database;
};

export type CreateAppOptions = {
  /** Persist system roles. Long-running server only — never on the Vercel request path. */
  seedAccess?: boolean;
};

function isDeleteOperation(path: string, method: string) {
  const normalized = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  return (
    method === "DELETE" ||
    (method === "POST" &&
      (normalized === "/api/contacts/bulk/delete" || normalized.endsWith("/contacts/remove")))
  );
}

export function createSendStackApp(env: ServerEnv, options: CreateAppOptions = {}): SendStackApp {
  const { db } = createDb(env);
  /** Prefer this after invalidateDbCache so middleware does not keep a dead client. */
  const liveDb = () => getDb(env);
  const app = new Hono();

  const allowedBrowserOrigins = new Set(authTrustedOrigins(env.FRONTEND_URL));

  app.use(
    "/api/*",
    cors({
      origin: (origin) =>
        origin && allowedBrowserOrigins.has(origin) ? origin : env.FRONTEND_URL,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  app.use("/api/*", async (c, next) => {
    const requestContext = auditRequestContextFromHeaders(c.req.raw.headers);
    c.header("x-request-id", requestContext.requestId);
    const started = Date.now();
    return runWithAuditRequestContext(requestContext, async () => {
      await next();
      try {
        await recordApiMutationAudit({
          db: liveDb(),
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          durationMs: Date.now() - started,
          headers: c.req.raw.headers,
          requestContext,
        });
      } catch (error) {
        console.error("[api-mutation-audit]", safeErrorLabel(error));
      }
    });
  });

  app.use("/api/*", async (c, next) => {
    if (
      c.req.path.startsWith("/api/auth") ||
      c.req.path === "/api/health" ||
      c.req.path === "/api/ping" ||
      c.req.path === "/api/build-version"
    ) {
      return next();
    }
    let account: Awaited<ReturnType<typeof getSessionUser>>;
    try {
      account = await getSessionUser(c.req.raw.headers);
      if (account && (account as { banned?: boolean | null }).banned) {
        return c.json({ error: accessDeniedMessage() }, 403);
      }
      if (isDeleteOperation(c.req.path, c.req.method)) {
        if (!account) return c.json({ error: "Unauthorized" }, 401);
        if (!canDeleteSystemData(account.role)) {
          return c.json({ error: "Only admins and super admins can delete system data." }, 403);
        }
      }
      if (account) {
        const signedIn = account;
        const security = await withDatabaseDeadline(
          () => loadAccountSecurityState(liveDb(), signedIn.id),
          "account-security",
        );
        if (security?.mustChangePassword && !isApiPathAllowedDuringPasswordChange(c.req.path, c.req.method)) {
          return c.json(
            { error: "Change your password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" },
            403,
          );
        }
        if (
          security?.twoFactorEnforcementRequired &&
          !isApiPathAllowedDuringTwoFactorSetup(c.req.path, c.req.method)
        ) {
          return c.json(
            {
              error: "Configure two-factor authentication before continuing.",
              code: "TWO_FACTOR_SETUP_REQUIRED",
            },
            403,
          );
        }
      }
      const permission = permissionForRequest(c.req.path, c.req.method);
      if (!permission) return next();
      if (!account) return c.json({ error: "Unauthorized" }, 401);
      const signedIn = account;
      const allowed = await withDatabaseDeadline(
        () => userHasPermission(liveDb(), signedIn, permission),
        "permission-check",
      );
      if (!allowed) {
        void recordAccessDeniedAudit(liveDb(), {
          actorUserId: signedIn.id,
          actorEmail: signedIn.email,
          permission,
          path: c.req.path,
          headers: c.req.raw.headers,
        });
        return c.json({ error: "You do not have permission to do that." }, 403);
      }
      return next();
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        const mapped = publicApiError(error);
        console.error(mapped.log);
        return c.json(mapped.body, mapped.status);
      }
      throw error;
    }
  });

  app.get("/api/build-version", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({
      buildId: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "local",
    });
  });

  registerHealthRoutes(app, {
    probeDatabase: () => probeDatabase(env.DATABASE_URL),
    probeRedis,
  });
  registerAccountRoutes(app);
  registerActivityRoutes(app);
  registerAdminRoutes(app);
  registerDraftRoutes(app);
  registerContactRoutes(app);
  registerContactListRoutes(app);
  registerContactImportRoutes(app);
  registerSuppressionRoutes(app);
  registerCampaignRoutes(app);
  registerQueueRoutes(app);
  registerMailRoutes(app);

  app.post("/api/auth/sign-up/email", async (c) => {
    const parsed = publicRegistrationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid signup details." }, 400);
    }

    const { code, roleKey, ...signup } = parsed.data;
    const signupDb = liveDb();
    const signupCode = await claimSignupCode(signupDb, code, roleKey);
    if (!signupCode) {
      return c.json({ error: "This signup code is invalid, expired, used, or for another role." }, 400);
    }

    let response: Response;
    try {
      const headers = new Headers(c.req.raw.headers);
      headers.set("content-type", "application/json");
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      const authRequest = new Request(c.req.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: signup.name,
          email: signup.email.trim().toLowerCase(),
          password: signup.password,
          callbackURL: "/app/",
        }),
      });
      response = await withDatabaseDeadline(() => auth.handler(authRequest), "auth-signup");
    } catch (error) {
      await releaseSignupCodeClaim(liveDb(), signupCode.id, signupCode.usedAt);
      throw error;
    }
    const dbAfterAuth = liveDb();
    if (!response.ok) {
      await releaseSignupCodeClaim(dbAfterAuth, signupCode.id, signupCode.usedAt);
      return response;
    }

    const result = await response.clone().json().catch(() => null) as
      | { user?: { id?: string } }
      | null;
    const userId = result?.user?.id;
    if (!userId) {
      await releaseSignupCodeClaim(dbAfterAuth, signupCode.id, signupCode.usedAt);
      return c.json({ error: "The account could not be created." }, 500);
    }

    let roleAssigned: boolean;
    try {
      roleAssigned = await dbAfterAuth.transaction(async (transaction) => {
        const [updated] = await transaction
          .update(user)
          .set({ role: roleKey, updatedAt: new Date() })
          .where(eq(user.id, userId))
          .returning({ id: user.id });
        if (!updated) return false;

        await transaction
          .insert(appUserRoles)
          .values({ userId, roleId: `role_${roleKey}`, assignedBy: signupCode.createdBy })
          .onConflictDoNothing();
        return true;
      });
    } catch (error) {
      try {
        await liveDb().delete(user).where(eq(user.id, userId));
      } catch (cleanupError) {
        console.error("[signup] incomplete account cleanup failed", safeErrorLabel(cleanupError));
      }
      try {
        await releaseSignupCodeClaim(liveDb(), signupCode.id, signupCode.usedAt);
      } catch (releaseError) {
        console.error("[signup] signup code release failed", safeErrorLabel(releaseError));
      }
      throw error;
    }
    if (!roleAssigned) {
      await releaseSignupCodeClaim(liveDb(), signupCode.id, signupCode.usedAt);
      return response;
    }

    try {
      await recordAudit(liveDb(), {
        actorUserId: userId,
        targetUserId: userId,
        action: AUDIT_ACTIONS.signupCompleted,
        metadata: { roleKey, signupCodeId: signupCode.id },
      });
    } catch (error) {
      console.error("[signup] audit write failed", safeErrorLabel(error));
    }
    return response;
  });

  app.all("/api/auth/*", async (c) => {
    let response: Response;
    try {
      const outcome = await withDatabaseDeadline(
        () =>
          captureDatabaseFailures(async () => {
            const authResponse = await auth.handler(c.req.raw);
            return { response: authResponse, failure: peekDatabaseFailure() };
          }),
        "auth",
      );
      response = outcome.response;
      if (outcome.failure && response.status >= 500) {
        console.error(
          `[auth] infrastructure failure kind=${outcome.failure.kind} response=database_unavailable`,
        );
        c.header("Cache-Control", "no-store");
        response = c.json(
          { error: "Database is temporarily unavailable.", code: "database_unavailable" },
          503,
        );
      }
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        const mapped = publicApiError(error);
        console.error(mapped.log);
        c.header("Cache-Control", "no-store");
        response = c.json(mapped.body, mapped.status);
      } else {
        throw error;
      }
    }
    try {
      await recordAuthHandlerAudit({
        db: liveDb(),
        path: c.req.path,
        method: c.req.method,
        status: response.status,
        headers: c.req.raw.headers,
      });
    } catch (error) {
      console.error("[auth-audit]", safeErrorLabel(error));
    }
    return response;
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((error, c) => {
    const mapped = publicApiError(error);
    console.error(mapped.log);
    return c.json(mapped.body, mapped.status);
  });

  const seedAccess = options.seedAccess ?? !process.env.VERCEL;
  if (seedAccess) {
    logStartup("Access control seed started");
    seedAccessControl(db).catch((error) => {
      console.error("[admin] access control seed failed", safeErrorLabel(error));
    });
  } else {
    logStartup("Access control seed skipped");
  }

  logStartup("Hono initialized");
  return { app, db };
}

let cachedApp: Hono | undefined;

/** Singleton Hono app for Vercel serverless (warm invocations reuse the instance). */
export function getSendStackApp(): Hono {
  if (!cachedApp) {
    cachedApp = createSendStackApp(loadEnv(), { seedAccess: false }).app;
  }
  return cachedApp;
}
