import type { Hono } from "hono";
import { z } from "zod";

import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { getSessionUser } from "../lib/session.js";
import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import {
  createEmailDraft,
  deleteEmailDraft,
  getEmailDraftById,
  listEmailDrafts,
  serializeDraft,
  updateEmailDraft,
} from "../services/drafts.js";
import { recordAuditEvent } from "../services/audit-log.js";
import {
  createDraftSchema,
  draftIdParamSchema,
  listDraftsQuerySchema,
  updateDraftSchema,
} from "../validation/drafts.js";

const env = loadEnv();
const db = createLiveDb(env);

function validationError(error: z.ZodError) {
  return {
    error: "Invalid input",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

export function registerDraftRoutes(app: Hono) {
  app.post("/api/drafts", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = createDraftSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(validationError(parsed.error), 400);
    }

    try {
      const row = await createEmailDraft(db, user.id, parsed.data);
      await recordAuditEvent(db, {
        action: AUDIT_ACTIONS.draftCreated,
        category: "DRAFT",
        actorUserId: user.id,
        resourceType: "draft",
        resourceId: row.id,
      });
      return c.json({ draft: serializeDraft(row) }, 201);
    } catch (error) {
      if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
        return c.json({ error: "Payload too large" }, 413);
      }
      throw error;
    }
  });

  app.get("/api/drafts", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const parsed = listDraftsQuerySchema.safeParse({
      page: c.req.query("page"),
      limit: c.req.query("limit"),
    });
    if (!parsed.success) {
      return c.json(validationError(parsed.error), 400);
    }

    const result = await listEmailDrafts(
      db,
      user.id,
      parsed.data.page,
      parsed.data.limit,
    );
    return c.json(result);
  });

  app.get("/api/drafts/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const params = draftIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) {
      return c.json({ error: "Draft not found" }, 404);
    }

    const row = await getEmailDraftById(db, user.id, params.data.id);
    if (!row) {
      return c.json({ error: "Draft not found" }, 404);
    }

    return c.json({ draft: serializeDraft(row) });
  });

  app.patch("/api/drafts/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const params = draftIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) {
      return c.json({ error: "Draft not found" }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = updateDraftSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(validationError(parsed.error), 400);
    }

    try {
      const row = await updateEmailDraft(db, user.id, params.data.id, parsed.data);
      if (!row) {
        return c.json({ error: "Draft not found" }, 404);
      }
      await recordAuditEvent(db, {
        action: AUDIT_ACTIONS.draftUpdated,
        category: "DRAFT",
        actorUserId: user.id,
        resourceType: "draft",
        resourceId: row.id,
      });
      return c.json({ draft: serializeDraft(row) });
    } catch (error) {
      if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
        return c.json({ error: "Payload too large" }, 413);
      }
      throw error;
    }
  });

  app.delete("/api/drafts/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const params = draftIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) {
      return c.json({ error: "Draft not found" }, 404);
    }

    const deleted = await deleteEmailDraft(db, user.id, params.data.id);
    if (!deleted) {
      return c.json({ error: "Draft not found" }, 404);
    }

    await recordAuditEvent(db, {
      action: AUDIT_ACTIONS.draftDeleted,
      category: "DRAFT",
      actorUserId: user.id,
      resourceType: "draft",
      resourceId: params.data.id,
    });

    return c.json({ ok: true });
  });
}
