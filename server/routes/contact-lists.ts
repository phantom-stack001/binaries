import type { Hono } from "hono";
import { z } from "zod";

import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import { validationError } from "../lib/http-errors.js";
import { clientIpFromRequest, userAgentFromRequest } from "../lib/request-context.js";
import { canViewAllRecipients, resolveRecipientOwnerId } from "../lib/org-workspace.js";
import { getSessionUser } from "../lib/session.js";
import { recordAuditEvent } from "../services/audit-log.js";
import { serializeContact } from "../services/contacts.js";
import {
  addContactsToList,
  createContactList,
  deleteContactList,
  getContactListById,
  listContactLists,
  listContactsInList,
  removeContactFromList,
  removeContactsFromList,
  serializeContactList,
  updateContactList,
} from "../services/contact-lists.js";
import {
  createContactListSchema,
  listMembersBodySchema,
  updateContactListSchema,
} from "../validation/contacts.js";

const env = loadEnv();
const db = createLiveDb(env);

const listIdParamSchema = z.object({ id: z.string().uuid() });

export function registerContactListRoutes(app: Hono) {
  app.get("/api/contact-lists", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const ownerId = resolveRecipientOwnerId(user);
    const lists = await listContactLists(
      db,
      canViewAllRecipients(user.role) ? null : ownerId,
      ownerId,
    );
    return c.json({ lists });
  });

  app.post("/api/contact-lists", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => null);
    const parsed = createContactListSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    try {
      const ownerId = resolveRecipientOwnerId(user);
      const row = await createContactList(db, ownerId, parsed.data, user.id);
      if (!row) return c.json({ error: "Could not create list" }, 500);
      return c.json({ list: serializeContactList(row, 0) }, 201);
    } catch (error) {
      if (error instanceof Error && error.message === "DUPLICATE_NAME") {
        return c.json({ error: "A list with this name already exists" }, 409);
      }
      throw error;
    }
  });

  app.get("/api/contact-lists/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = listIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "List not found" }, 404);

    const ownerId = resolveRecipientOwnerId(user);
    const canViewAll = canViewAllRecipients(user.role);
    const row = await getContactListById(db, canViewAll ? null : ownerId, params.data.id);
    if (!row) return c.json({ error: "List not found" }, 404);

    const detail = await listContactsInList(db, canViewAll ? null : ownerId, params.data.id, 1, 1);
    const memberCount = detail?.pagination.total ?? 0;
    return c.json({ list: serializeContactList(row, memberCount, row.userId === ownerId) });
  });

  app.patch("/api/contact-lists/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = listIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "List not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = updateContactListSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    try {
      const ownerId = resolveRecipientOwnerId(user);
      const updated = await updateContactList(db, ownerId, params.data.id, parsed.data, user.id);
      if (!updated) return c.json({ error: "List not found" }, 404);
      if (updated.previousIsTestList !== updated.row.isTestList) {
        await recordAuditEvent(db, {
          action: updated.row.isTestList
            ? AUDIT_ACTIONS.recipientListMarkedTest
            : AUDIT_ACTIONS.recipientListUnmarkedTest,
          category: "RECIPIENT_LIST",
          result: "success",
          actorUserId: user.id,
          actorEmail: user.email,
          resourceType: "contact_list",
          resourceId: updated.row.id,
          requestContext: {
            ipAddress: clientIpFromRequest(c),
            userAgent: userAgentFromRequest(c),
          },
          metadata: { listId: updated.row.id, listName: updated.row.name },
        }).catch(() => undefined);
      }
      const detail = await listContactsInList(db, ownerId, params.data.id, 1, 1);
      return c.json({
        list: serializeContactList(updated.row, detail?.pagination.total ?? 0),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "DUPLICATE_NAME") {
        return c.json({ error: "A list with this name already exists" }, 409);
      }
      throw error;
    }
  });

  app.delete("/api/contact-lists/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = listIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "List not found" }, 404);

    const ownerId = resolveRecipientOwnerId(user);
    const deleted = await deleteContactList(db, ownerId, params.data.id, user.id);
    if (!deleted) return c.json({ error: "List not found" }, 404);
    return c.json({ ok: true });
  });

  app.get("/api/contact-lists/:id/contacts", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = listIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "List not found" }, 404);

    const page = Number(c.req.query("page") ?? "1");
    const limit = Number(c.req.query("limit") ?? "25");
    const ownerId = resolveRecipientOwnerId(user);
    const result = await listContactsInList(
      db,
      canViewAllRecipients(user.role) ? null : ownerId,
      params.data.id,
      page,
      limit,
    );
    if (!result) return c.json({ error: "List not found" }, 404);

    return c.json({
      list: serializeContactList(result.list, result.pagination.total, result.list.userId === ownerId),
      contacts: result.contacts.map((row) =>
        serializeContact(row, { canManage: result.list.userId === ownerId }),
      ),
      pagination: result.pagination,
    });
  });

  app.post("/api/contact-lists/:id/contacts", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = listIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "List not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = listMembersBodySchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const ownerId = resolveRecipientOwnerId(user);
    const result = await addContactsToList(
      db,
      ownerId,
      params.data.id,
      parsed.data.contactIds,
    );
    if (!result) return c.json({ error: "List not found" }, 404);
    return c.json(result);
  });

  app.delete("/api/contact-lists/:id/contacts/:contactId", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const listId = c.req.param("id");
    const contactId = c.req.param("contactId");
    if (!z.string().uuid().safeParse(listId).success) {
      return c.json({ error: "List not found" }, 404);
    }
    if (!z.string().uuid().safeParse(contactId).success) {
      return c.json({ error: "Contact not found" }, 404);
    }

    const ownerId = resolveRecipientOwnerId(user);
    const removed = await removeContactFromList(db, ownerId, listId, contactId);
    if (!removed) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/contact-lists/:id/contacts/remove", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = listIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "List not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = listMembersBodySchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const ownerId = resolveRecipientOwnerId(user);
    const result = await removeContactsFromList(
      db,
      ownerId,
      params.data.id,
      parsed.data.contactIds,
    );
    if (!result) return c.json({ error: "List not found" }, 404);
    return c.json(result);
  });
}
