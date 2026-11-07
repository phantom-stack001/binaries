import type { Hono } from "hono";

import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { validationError } from "../lib/http-errors.js";
import { resolveRecipientOwnerId } from "../lib/org-workspace.js";
import { getSessionUser } from "../lib/session.js";
import {
  createSuppression,
  listSuppressions,
  serializeSuppression,
} from "../services/suppressions.js";
import {
  createSuppressionSchema,
  listSuppressionsQuerySchema,
} from "../validation/contacts.js";

const env = loadEnv();
const db = createLiveDb(env);

export function registerSuppressionRoutes(app: Hono) {
  app.get("/api/suppressions", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const parsed = listSuppressionsQuerySchema.safeParse({
      page: c.req.query("page"),
      limit: c.req.query("limit"),
      q: c.req.query("q"),
      reason: c.req.query("reason"),
    });
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const result = await listSuppressions(db, ownerId, parsed.data);
    return c.json(result);
  });

  app.post("/api/suppressions", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const body = await c.req.json().catch(() => null);
    const parsed = createSuppressionSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const row = await createSuppression(db, ownerId, parsed.data, user.id);
    if (!row) return c.json({ error: "Could not create suppression" }, 500);
    return c.json({ suppression: serializeSuppression(row) }, 201);
  });
}
