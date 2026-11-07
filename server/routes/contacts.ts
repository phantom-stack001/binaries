import type { Hono } from "hono";

import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { validationError } from "../lib/http-errors.js";
import { canViewAllRecipients, isSuperAdminRole, resolveRecipientOwnerId } from "../lib/org-workspace.js";
import { getSessionUser } from "../lib/session.js";
import {
  bulkDeleteContacts,
  bulkUnsubscribeContacts,
  createContact,
  deleteContact,
  getContactById,
  getContactStats,
  listContacts,
  serializeContact,
  unsubscribeContact,
  updateContact,
} from "../services/contacts.js";
import {
  bulkContactActionSchema,
  contactIdParamSchema,
  createContactSchema,
  listContactsQuerySchema,
  updateContactSchema,
} from "../validation/contacts.js";

const env = loadEnv();
const db = createLiveDb(env);

export function registerContactRoutes(app: Hono) {
  app.get("/api/contacts/stats", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);
    const viewOwnerId = c.req.query("scope") === "all" && canViewAllRecipients(user.role) ? null : ownerId;
    const stats = await getContactStats(db, viewOwnerId);
    return c.json({ stats });
  });

  app.get("/api/contacts", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);
    const viewOwnerId = c.req.query("scope") === "all" && canViewAllRecipients(user.role) ? null : ownerId;

    const parsed = listContactsQuerySchema.safeParse({
      page: c.req.query("page"),
      limit: c.req.query("limit"),
      q: c.req.query("q"),
      status: c.req.query("status"),
      listId: c.req.query("listId"),
      sort: c.req.query("sort"),
    });
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const result = await listContacts(db, viewOwnerId, parsed.data, ownerId, isSuperAdminRole(user.role));
    return c.json(result);
  });

  app.post("/api/contacts", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const body = await c.req.json().catch(() => null);
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    try {
      const row = await createContact(db, ownerId, parsed.data, user.id);
      return c.json({ contact: serializeContact(row, { canManage: isSuperAdminRole(user.role), canAddToList: true }) }, 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "DUPLICATE_EMAIL") {
          return c.json({ error: "A contact with this email already exists" }, 409);
        }
      }
      throw error;
    }
  });

  app.get("/api/contacts/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const params = contactIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Contact not found" }, 404);

    const viewOwnerId = canViewAllRecipients(user.role) ? null : ownerId;
    const row = await getContactById(db, viewOwnerId, params.data.id);
    if (!row) return c.json({ error: "Contact not found" }, 404);
    return c.json({ contact: serializeContact(row, { canManage: isSuperAdminRole(user.role) }) });
  });

  app.patch("/api/contacts/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const params = contactIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Contact not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    try {
      const row = await updateContact(db, isSuperAdminRole(user.role) ? null : ownerId, params.data.id, parsed.data, user.id);
      if (!row) return c.json({ error: "Contact not found" }, 404);
      return c.json({ contact: serializeContact(row, { canManage: isSuperAdminRole(user.role), canAddToList: true }) });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "DUPLICATE_EMAIL") {
          return c.json({ error: "A contact with this email already exists" }, 409);
        }
      }
      throw error;
    }
  });

  app.delete("/api/contacts/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const params = contactIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Contact not found" }, 404);

    const deleted = await deleteContact(db, isSuperAdminRole(user.role) ? null : ownerId, params.data.id, user.id);
    if (!deleted) return c.json({ error: "Contact not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/contacts/:id/unsubscribe", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const params = contactIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Contact not found" }, 404);

    const row = await unsubscribeContact(db, isSuperAdminRole(user.role) ? null : ownerId, params.data.id, user.id);
    if (!row) return c.json({ error: "Contact not found" }, 404);
    return c.json({ contact: serializeContact(row, { canManage: isSuperAdminRole(user.role), canAddToList: true }) });
  });

  app.post("/api/contacts/bulk/unsubscribe", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const body = await c.req.json().catch(() => null);
    const parsed = bulkContactActionSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const result = await bulkUnsubscribeContacts(db, isSuperAdminRole(user.role) ? null : ownerId, parsed.data.contactIds, user.id);
    return c.json(result);
  });

  app.post("/api/contacts/bulk/delete", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);

    const body = await c.req.json().catch(() => null);
    const parsed = bulkContactActionSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const result = await bulkDeleteContacts(db, isSuperAdminRole(user.role) ? null : ownerId, parsed.data.contactIds, user.id);
    return c.json(result);
  });
}
