import { eq } from "drizzle-orm";

import { parseRoleKeys } from "../auth/permissions.js";
import type { Database } from "../db/index.js";
import { user } from "../db/schema.js";

/** Stable system user that owns the shared super-admin recipient pool. */
export const ORG_WORKSPACE_USER_ID = "org_workspace";
export const ORG_WORKSPACE_EMAIL = "workspace@system.local";
export const ORG_WORKSPACE_NAME = "Organization workspace";

export function isSuperAdminRole(role?: string | null) {
  return parseRoleKeys(role).includes("super-admin");
}

/** Admin roles can inspect recipient lists owned by any account. */
export function canViewAllRecipients(role?: string | null) {
  const roles = parseRoleKeys(role);
  return roles.includes("admin") || roles.includes("super-admin");
}

/** Only administrator roles may perform destructive system actions. */
export function canDeleteSystemData(role?: string | null) {
  return isSuperAdminRole(role);
}

/** Resolve which user id owns contacts/lists/suppressions for this actor. */
export function resolveRecipientOwnerId(actor: { id: string; role?: string | null }): string {
  return isSuperAdminRole(actor.role) ? ORG_WORKSPACE_USER_ID : actor.id;
}

/** Worker/async path: look up the account role, then resolve the recipient owner. */
export async function resolveRecipientOwnerIdForUserId(db: Database, userId: string): Promise<string> {
  if (userId === ORG_WORKSPACE_USER_ID) return ORG_WORKSPACE_USER_ID;
  const [row] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return userId;
  return resolveRecipientOwnerId(row);
}

export async function ensureOrgWorkspaceUser(db: Database) {
  await db
    .insert(user)
    .values({
      id: ORG_WORKSPACE_USER_ID,
      name: ORG_WORKSPACE_NAME,
      email: ORG_WORKSPACE_EMAIL,
      emailVerified: true,
      role: "user",
      banned: true,
      banReason: "system_workspace",
      mustChangePassword: false,
      twoFactorEnabled: false,
    })
    .onConflictDoNothing();
}
