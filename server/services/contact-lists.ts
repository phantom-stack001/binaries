import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../db/index.js";
import { contactListMembers, contactLists, contacts } from "../db/schema.js";
import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import { recordAuditEvent } from "./audit-log.js";

export function serializeContactList(
  row: typeof contactLists.$inferSelect,
  memberCount: number,
  canManage = true,
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isTestList: row.isTestList,
    memberCount,
    canManage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listContactLists(db: Database, userId: string | null, manageableOwnerId?: string) {
  const rows = await db
    .select()
    .from(contactLists)
    .where(userId ? eq(contactLists.userId, userId) : undefined)
    .orderBy(desc(contactLists.updatedAt));

  const counts = await db
    .select({
      listId: contactListMembers.listId,
      count: sql<number>`count(*)::int`,
    })
    .from(contactListMembers)
    .innerJoin(contactLists, eq(contactLists.id, contactListMembers.listId))
    .where(userId ? eq(contactLists.userId, userId) : undefined)
    .groupBy(contactListMembers.listId);

  const countMap = new Map(counts.map((row) => [row.listId, row.count]));

  return rows.map((row) =>
    serializeContactList(row, countMap.get(row.id) ?? 0, manageableOwnerId ? row.userId === manageableOwnerId : true),
  );
}

export async function getContactListById(db: Database, userId: string | null, listId: string) {
  const [row] = await db
    .select()
    .from(contactLists)
    .where(userId ? and(eq(contactLists.id, listId), eq(contactLists.userId, userId)) : eq(contactLists.id, listId))
    .limit(1);
  return row ?? null;
}

export async function createContactList(
  db: Database,
  userId: string,
  input: { name: string; description?: string; isTestList?: boolean },
  actorUserId?: string,
) {
  try {
    const [row] = await db
      .insert(contactLists)
      .values({
        id: crypto.randomUUID(),
        userId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        isTestList: input.isTestList ?? false,
      })
      .returning();
    if (row) {
      await recordAuditEvent(db, {
        action: AUDIT_ACTIONS.contactListCreated,
        category: "RECIPIENT_LIST",
        actorUserId: actorUserId ?? userId,
        resourceType: "contact_list",
        resourceId: row.id,
        metadata: { listName: row.name, isTestList: row.isTestList },
      });
    }
    return row ?? null;
  } catch (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") throw new Error("DUPLICATE_NAME", { cause: error });
    throw error;
  }
}

export async function updateContactList(
  db: Database,
  userId: string,
  listId: string,
  input: { name?: string; description?: string; isTestList?: boolean },
  actorUserId?: string,
) {
  const existing = await getContactListById(db, userId, listId);
  if (!existing) return null;

  try {
    const [row] = await db
      .update(contactLists)
      .set({
        name: input.name?.trim() ?? existing.name,
        description: input.description?.trim() ?? existing.description,
        isTestList: input.isTestList ?? existing.isTestList,
        updatedAt: new Date(),
      })
      .where(and(eq(contactLists.id, listId), eq(contactLists.userId, userId)))
      .returning();
    if (!row) return null;
    const nameOrDescriptionChanged =
      row.name !== existing.name || row.description !== existing.description;
    if (nameOrDescriptionChanged) {
      await recordAuditEvent(db, {
        action: AUDIT_ACTIONS.contactListUpdated,
        category: "RECIPIENT_LIST",
        actorUserId: actorUserId ?? userId,
        resourceType: "contact_list",
        resourceId: row.id,
        metadata: { listName: row.name },
      });
    }
    return { row, previousIsTestList: existing.isTestList };
  } catch (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") throw new Error("DUPLICATE_NAME", { cause: error });
    throw error;
  }
}

export async function deleteContactList(db: Database, userId: string, listId: string, actorUserId?: string) {
  const [row] = await db
    .delete(contactLists)
    .where(and(eq(contactLists.id, listId), eq(contactLists.userId, userId)))
    .returning({ id: contactLists.id, name: contactLists.name });
  if (row) {
    await recordAuditEvent(db, {
      action: AUDIT_ACTIONS.contactListDeleted,
      category: "RECIPIENT_LIST",
      actorUserId: actorUserId ?? userId,
      resourceType: "contact_list",
      resourceId: row.id,
      metadata: { listName: row.name },
    });
  }
  return row ? { id: row.id } : null;
}

export async function listContactsInList(
  db: Database,
  userId: string | null,
  listId: string,
  page: number,
  limit: number,
) {
  const list = await getContactListById(db, userId, listId);
  if (!list) return null;

  const offset = (page - 1) * limit;

  const [rows, countRow] = await Promise.all([
    db
      .select({ contact: contacts })
      .from(contactListMembers)
      .innerJoin(contacts, eq(contacts.id, contactListMembers.contactId))
      .where(
        and(eq(contactListMembers.listId, listId), eq(contacts.userId, list.userId)),
      )
      .orderBy(desc(contacts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactListMembers)
      .innerJoin(contacts, eq(contacts.id, contactListMembers.contactId))
      .where(
        and(eq(contactListMembers.listId, listId), eq(contacts.userId, list.userId)),
      ),
  ]);

  const total = countRow[0]?.count ?? 0;

  return {
    list,
    contacts: rows.map((row) => row.contact),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function addContactsToList(
  db: Database,
  userId: string,
  listId: string,
  contactIds: string[],
) {
  const list = await getContactListById(db, userId, listId);
  if (!list) return null;

  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.id, contactIds)));

  const existingMembers = await db
    .select({ contactId: contactListMembers.contactId })
    .from(contactListMembers)
    .where(
      and(
        eq(contactListMembers.listId, listId),
        inArray(contactListMembers.contactId, owned.map((row) => row.id)),
      ),
    );
  const existingSet = new Set(existingMembers.map((row) => row.contactId));

  let added = 0;
  for (const contact of owned) {
    if (existingSet.has(contact.id)) continue;
    await db.insert(contactListMembers).values({
      id: crypto.randomUUID(),
      listId,
      contactId: contact.id,
    });
    added += 1;
  }

  return { added, skipped: owned.length - added, requested: contactIds.length };
}

export async function removeContactFromList(
  db: Database,
  userId: string,
  listId: string,
  contactId: string,
) {
  const list = await getContactListById(db, userId, listId);
  if (!list) return null;

  const contact = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (!contact[0]) return null;

  const [row] = await db
    .delete(contactListMembers)
    .where(
      and(
        eq(contactListMembers.listId, listId),
        eq(contactListMembers.contactId, contactId),
      ),
    )
    .returning({ id: contactListMembers.id });

  return row ?? null;
}

export async function removeContactsFromList(
  db: Database,
  userId: string,
  listId: string,
  contactIds: string[],
) {
  const list = await getContactListById(db, userId, listId);
  if (!list) return null;

  const result = await db
    .delete(contactListMembers)
    .where(
      and(
        eq(contactListMembers.listId, listId),
        inArray(contactListMembers.contactId, contactIds),
      ),
    )
    .returning({ id: contactListMembers.id });

  return { removed: result.length };
}
