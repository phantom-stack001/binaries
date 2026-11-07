import type { Hono } from "hono";

import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { validationError } from "../lib/http-errors.js";
import { resolveRecipientOwnerId } from "../lib/org-workspace.js";
import { getSessionUser } from "../lib/session.js";
import { executeCsvImport, previewCsvImport } from "../services/contact-import.js";
import {
  importContactsSchema,
  importPreviewSchema,
} from "../validation/contact-import.js";

const env = loadEnv();
const db = createLiveDb(env);

export function registerContactImportRoutes(app: Hono) {
  app.post("/api/contacts/import/preview", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => null);
    const parsed = importPreviewSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const preview = previewCsvImport(parsed.data.csvText);
    return c.json({ preview });
  });

  app.post("/api/contacts/import", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const body = await c.req.json().catch(() => null);
    const parsed = importContactsSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const result = await executeCsvImport(
      db,
      ownerId,
      parsed.data.csvText,
      parsed.data.mapping,
      user.id,
    );
    return c.json({ result });
  });
}
