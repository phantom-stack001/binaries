import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";

import type { Database } from "../db/index.js";
import {
  contactConsentEvents,
  contactListMembers,
  contactLists,
  contacts,
  emailSuppressions,
} from "../db/schema.js";
import { getAppName } from "../lib/brand.js";
import { isValidEmail, normalizeEmail } from "../lib/email-normalization.js";
import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import type { SubscriptionStatus } from "../validation/contacts.js";
import { recordAuditEvent } from "./audit-log.js";

export type ContactRow = typeof contacts.$inferSelect;

/** Default consent when a contact is marked subscribed without explicit evidence (manual add / dashboard). */
export const DEFAULT_SUBSCRIBED_CONSENT = {
  source: `${getAppName()} manual add`,
  method: "dashboard",
} as const;

function resolveSubscribedConsent(input: {
  consentSource?: string;
  consentMethod?: string;
  consentOccurredAt?: string;
}) {
  return {
    consentSource: input.consentSource?.trim() || DEFAULT_SUBSCRIBED_CONSENT.source,
    consentMethod: input.consentMethod?.trim() || DEFAULT_SUBSCRIBED_CONSENT.method,
    consentOccurredAt: input.consentOccurredAt ?? new Date().toISOString(),
  };
}

export function serializeContact(
  row: ContactRow,
  extras?: { listNames?: string[]; canManage?: boolean; canAddToList?: boolean },
) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    company: row.company,
    phone: row.phone,
    subscriptionStatus: row.subscriptionStatus as SubscriptionStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    listNames: extras?.listNames ?? [],
    canManage: extras?.canManage ?? true,
    canAddToList: extras?.canAddToList ?? true,
  };
}

async function recordConsentEvent(
  db: Database,
  input: {
    userId: string;
    contactId: string;
    eventType: "consent_granted" | "consent_withdrawn" | "consent_updated";
    source: string;
    occurredAt: Date;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(contactConsentEvents).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    contactId: input.contactId,
    eventType: input.eventType,
    source: input.source,
    occurredAt: input.occurredAt,
    metadata: input.metadata,
  });
}

async function isEmailSuppressed(db: Database, userId: string, email: string) {
  const [row] = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.userId, userId), eq(emailSuppressions.email, email)))
    .limit(1);
  return Boolean(row);
}

export async function getContactStats(db: Database, userId: string | null) {
  const rows = await db
    .select({
      status: contacts.subscriptionStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(contacts)
    .where(userId ? eq(contacts.userId, userId) : undefined)
    .groupBy(contacts.subscriptionStatus);

  const stats = {
    total: 0,
    subscribed: 0,
    unsubscribed: 0,
    pending: 0,
    unknown: 0,
  };

  for (const row of rows) {
    stats.total += row.count;
    if (row.status === "subscribed") stats.subscribed = row.count;
    if (row.status === "unsubscribed") stats.unsubscribed = row.count;
    if (row.status === "pending") stats.pending = row.count;
    if (row.status === "unknown") stats.unknown = row.count;
  }

  return stats;
}

export async function listContacts(
  db: Database,
  userId: string | null,
  options: {
    page: number;
    limit: number;
    q?: string;
    status?: "subscribed" | "unsubscribed";
    listId?: string;
    sort: "created_at_desc" | "created_at_asc" | "email_asc";
  },
  manageableOwnerId?: string,
  canManageAll = false,
) {
  const offset = (options.page - 1) * options.limit;
  const conditions = userId ? [eq(contacts.userId, userId)] : [];

  if (options.status === "subscribed") {
    conditions.push(eq(contacts.subscriptionStatus, "subscribed"));
  } else if (options.status === "unsubscribed") {
    conditions.push(ne(contacts.subscriptionStatus, "subscribed"));
  }

  if (options.q?.trim()) {
    const term = `%${options.q.trim()}%`;
    conditions.push(
      or(
        ilike(contacts.email, term),
        ilike(contacts.firstName, term),
        ilike(contacts.lastName, term),
        ilike(contacts.company, term),
      )!,
    );
  }

  if (options.listId) {
    const members = await db
      .select({ contactId: contactListMembers.contactId })
      .from(contactListMembers)
      .innerJoin(contactLists, eq(contactLists.id, contactListMembers.listId))
      .where(
        and(
          eq(contactListMembers.listId, options.listId),
          userId ? eq(contactLists.userId, userId) : undefined,
        ),
      );
    const memberIds = members.map((row) => row.contactId);
    if (memberIds.length === 0) {
      return {
        contacts: [],
        pagination: {
          page: options.page,
          limit: options.limit,
          total: 0,
          totalPages: 1,
        },
      };
    }
    conditions.push(inArray(contacts.id, memberIds));
  }

  const whereClause = and(...conditions);

  const orderBy =
    options.sort === "email_asc"
      ? asc(contacts.email)
      : options.sort === "created_at_asc"
        ? asc(contacts.createdAt)
        : desc(contacts.createdAt);

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(options.limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(whereClause),
  ]);

  const contactIds = rows.map((row) => row.id);
  const listNameMap = new Map<string, string[]>();

  if (contactIds.length > 0) {
    const memberships = await db
      .select({
        contactId: contactListMembers.contactId,
        listName: contactLists.name,
      })
      .from(contactListMembers)
      .innerJoin(contactLists, eq(contactLists.id, contactListMembers.listId))
      .where(
        and(
          userId ? eq(contactLists.userId, userId) : undefined,
          inArray(contactListMembers.contactId, contactIds),
        ),
      );

    for (const membership of memberships) {
      const current = listNameMap.get(membership.contactId) ?? [];
      current.push(membership.listName);
      listNameMap.set(membership.contactId, current);
    }
  }

  const total = countRow[0]?.count ?? 0;

  return {
    contacts: rows.map((row) =>
      serializeContact(row, {
        listNames: listNameMap.get(row.id) ?? [],
        canManage: canManageAll,
        canAddToList: Boolean(manageableOwnerId && row.userId === manageableOwnerId),
      }),
    ),
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.limit)),
    },
  };
}

export async function getContactById(db: Database, userId: string | null, contactId: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(userId ? and(eq(contacts.id, contactId), eq(contacts.userId, userId)) : eq(contacts.id, contactId))
    .limit(1);
  return row ?? null;
}

export async function createContact(
  db: Database,
  userId: string,
  input: {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    phone?: string;
    subscriptionStatus?: SubscriptionStatus;
    consentSource?: string;
    consentMethod?: string;
    consentOccurredAt?: string;
  },
  actorUserId?: string,
) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new Error("INVALID_EMAIL");
  }

  const suppressed = await isEmailSuppressed(db, userId, email);
  let status: SubscriptionStatus = input.subscriptionStatus ?? "subscribed";
  if (suppressed) {
    status = "unsubscribed";
  }

  const consent =
    status === "subscribed" ? resolveSubscribedConsent(input) : null;

  const id = crypto.randomUUID();
  try {
    const [row] = await db
      .insert(contacts)
      .values({
        id,
        userId,
        email,
        firstName: input.firstName?.trim() ?? "",
        lastName: input.lastName?.trim() ?? "",
        company: input.company?.trim() ?? "",
        phone: input.phone?.trim() ?? "",
        subscriptionStatus: status,
      })
      .returning();

    if (!row) throw new Error("CREATE_FAILED");

    if (status === "subscribed" && consent) {
      await recordConsentEvent(db, {
        userId,
        contactId: row.id,
        eventType: "consent_granted",
        source: consent.consentSource,
        occurredAt: new Date(consent.consentOccurredAt),
        metadata: { method: consent.consentMethod },
      });
    }

    await recordAuditEvent(db, {
      action: AUDIT_ACTIONS.contactCreated,
      category: "CONTACT",
      actorUserId: actorUserId ?? userId,
      resourceType: "contact",
      resourceId: row.id,
    });

    return row;
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      throw new Error("DUPLICATE_EMAIL", { cause: error });
    }
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      throw new Error("DUPLICATE_EMAIL", { cause: error });
    }
    throw error;
  }
}

export async function updateContact(
  db: Database,
  userId: string | null,
  contactId: string,
  input: {
    email?: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    phone?: string;
    subscriptionStatus?: SubscriptionStatus;
    consentSource?: string;
    consentMethod?: string;
    consentOccurredAt?: string;
  },
  actorUserId?: string,
) {
  const existing = await getContactById(db, userId, contactId);
  if (!existing) return null;
  const dataOwnerId = existing.userId;

  const nextEmail = input.email ? normalizeEmail(input.email) : existing.email;
  if (!isValidEmail(nextEmail)) {
    throw new Error("INVALID_EMAIL");
  }

  const emailChanged = nextEmail !== existing.email;
  let nextStatus = input.subscriptionStatus ?? existing.subscriptionStatus;

  const suppressed = await isEmailSuppressed(db, dataOwnerId, nextEmail);
  if (suppressed) {
    nextStatus = "unsubscribed";
  }

  const subscribing =
    nextStatus === "subscribed" &&
    (emailChanged || existing.subscriptionStatus !== "subscribed");
  const consent = subscribing ? resolveSubscribedConsent(input) : null;

  try {
    const [row] = await db
      .update(contacts)
      .set({
        email: nextEmail,
        firstName: input.firstName?.trim() ?? existing.firstName,
        lastName: input.lastName?.trim() ?? existing.lastName,
        company: input.company?.trim() ?? existing.company,
        phone: input.phone?.trim() ?? existing.phone,
        subscriptionStatus: nextStatus,
        updatedAt: new Date(),
      })
      .where(
        userId
          ? and(eq(contacts.id, contactId), eq(contacts.userId, userId))
          : eq(contacts.id, contactId),
      )
      .returning();

    if (!row) return null;

    if (subscribing && consent) {
      await recordConsentEvent(db, {
        userId: dataOwnerId,
        contactId: row.id,
        eventType: emailChanged ? "consent_updated" : "consent_granted",
        source: consent.consentSource,
        occurredAt: new Date(consent.consentOccurredAt),
        metadata: { method: consent.consentMethod },
      });
    }

    await recordAuditEvent(db, {
      action: AUDIT_ACTIONS.contactUpdated,
      category: "CONTACT",
      actorUserId: actorUserId ?? dataOwnerId,
      resourceType: "contact",
      resourceId: row.id,
    });

    return row;
  } catch (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      throw new Error("DUPLICATE_EMAIL", { cause: error });
    }
    throw error;
  }
}

export async function deleteContact(db: Database, userId: string | null, contactId: string, actorUserId?: string) {
  const [row] = await db
    .delete(contacts)
    .where(userId ? and(eq(contacts.id, contactId), eq(contacts.userId, userId)) : eq(contacts.id, contactId))
    .returning({ id: contacts.id, userId: contacts.userId });
  if (row) {
    await recordAuditEvent(db, {
      action: AUDIT_ACTIONS.contactDeleted,
      category: "CONTACT",
      actorUserId: actorUserId ?? row.userId,
      resourceType: "contact",
      resourceId: row.id,
    });
  }
  return row ?? null;
}

export async function unsubscribeContact(db: Database, userId: string | null, contactId: string, actorUserId?: string) {
  const existing = await getContactById(db, userId, contactId);
  if (!existing) return null;
  const dataOwnerId = existing.userId;

  const [row] = await db
    .update(contacts)
    .set({
      subscriptionStatus: "unsubscribed",
      updatedAt: new Date(),
    })
    .where(
      userId
        ? and(eq(contacts.id, contactId), eq(contacts.userId, userId))
        : eq(contacts.id, contactId),
    )
    .returning();

  if (!row) return null;

  await recordConsentEvent(db, {
    userId: dataOwnerId,
    contactId: row.id,
    eventType: "consent_withdrawn",
    source: "manual_unsubscribe",
    occurredAt: new Date(),
  });

  await recordAuditEvent(db, {
    action: AUDIT_ACTIONS.contactUpdated,
    category: "CONTACT",
    actorUserId: actorUserId ?? dataOwnerId,
    resourceType: "contact",
    resourceId: row.id,
  });

  await db
    .insert(emailSuppressions)
    .values({
      id: crypto.randomUUID(),
      userId: dataOwnerId,
      email: row.email,
      reason: "unsubscribed",
    })
    .onConflictDoUpdate({
      target: [emailSuppressions.userId, emailSuppressions.email],
      set: { reason: "unsubscribed", updatedAt: new Date() },
    });

  return row;
}

export async function bulkUnsubscribeContacts(
  db: Database,
  userId: string | null,
  contactIds: string[],
  actorUserId?: string,
) {
  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(userId ? and(eq(contacts.userId, userId), inArray(contacts.id, contactIds)) : inArray(contacts.id, contactIds));

  const ids = owned.map((row) => row.id);
  for (const id of ids) {
    await unsubscribeContact(db, userId, id, actorUserId);
  }
  return { updated: ids.length };
}

export async function bulkDeleteContacts(
  db: Database,
  userId: string | null,
  contactIds: string[],
  actorUserId?: string,
) {
  const result = await db
    .delete(contacts)
    .where(userId ? and(eq(contacts.userId, userId), inArray(contacts.id, contactIds)) : inArray(contacts.id, contactIds))
    .returning({ id: contacts.id, userId: contacts.userId });
  for (const row of result) {
    await recordAuditEvent(db, {
      action: AUDIT_ACTIONS.contactDeleted,
      category: "CONTACT",
      actorUserId: actorUserId ?? row.userId,
      resourceType: "contact",
      resourceId: row.id,
    });
  }
  return { deleted: result.length };
}
