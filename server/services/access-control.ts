import { eq, inArray } from "drizzle-orm";

import {
  PERMISSION_DETAILS,
  PERMISSIONS,
  ROLE_TEMPLATES,
  SYSTEM_ROLE_KEYS,
  parseRoleKeys,
  type PermissionKey,
  type SystemRoleKey,
} from "../auth/permissions.js";
import type { Database } from "../db/index.js";
import { appPermissions, appRolePermissions, appRoles, appUserRoles, user } from "../db/schema.js";
import { canDeleteSystemData, ensureOrgWorkspaceUser } from "../lib/org-workspace.js";

const DELETE_PERMISSION_KEYS = [
  "users.delete",
  "roles.delete",
  "drafts.delete",
  "templates.delete",
  "contacts.delete",
  "lists.delete",
  "campaigns.delete",
] as const satisfies readonly PermissionKey[];

const NON_SUPER_ADMIN_RECIPIENT_RESTRICTIONS = [
  ...DELETE_PERMISSION_KEYS,
  "contacts.update",
  "contacts.export",
  "lists.create",
  "lists.update",
] as const satisfies readonly PermissionKey[];

export async function seedAccessControl(db: Database) {
  await ensureOrgWorkspaceUser(db);

  for (const key of PERMISSIONS) {
    const detail = PERMISSION_DETAILS[key];
    await db
      .insert(appPermissions)
      .values({
        id: key,
        key,
        description: detail.description,
        category: detail.category,
      })
      .onConflictDoNothing();
  }

  for (const key of SYSTEM_ROLE_KEYS) {
    const template = ROLE_TEMPLATES[key];
    await db
      .insert(appRoles)
      .values({
        id: `role_${key}`,
        key,
        name: template.name,
        description: template.description,
        isSystem: true,
      })
      .onConflictDoNothing();

    const roleId = `role_${key}`;
    await db.delete(appRolePermissions).where(eq(appRolePermissions.roleId, roleId));
    if (template.permissions.length > 0) {
      await db.insert(appRolePermissions).values(
        template.permissions.map((permission) => ({
          roleId,
          permissionId: permission,
        })),
      );
    }
  }

  const superAdmins = await db
    .select({ id: user.id, role: user.role })
    .from(user);
  for (const account of superAdmins) {
    const keys = parseRoleKeys(account.role);
    if (!keys.includes("super-admin")) continue;
    await db
      .insert(appUserRoles)
      .values({
        userId: account.id,
        roleId: "role_super-admin",
        assignedBy: null,
      })
      .onConflictDoNothing();
  }
}

export async function permissionsForUser(
  db: Database,
  account: { id: string; role?: string | null },
) {
  const keys = new Set(parseRoleKeys(account.role));
  const assigned = await db
    .select({ key: appRoles.key })
    .from(appUserRoles)
    .innerJoin(appRoles, eq(appRoles.id, appUserRoles.roleId))
    .where(eq(appUserRoles.userId, account.id));
  for (const row of assigned) keys.add(row.key);

  if (keys.has("super-admin")) {
    return new Set<PermissionKey>(PERMISSIONS);
  }

  const roleIds = [...keys].map((key) => `role_${key}`);
  const stored = roleIds.length
    ? await db
        .select({ key: appPermissions.key })
        .from(appRolePermissions)
        .innerJoin(appPermissions, eq(appPermissions.id, appRolePermissions.permissionId))
        .where(inArray(appRolePermissions.roleId, roleIds))
    : [];

  const permissions = new Set<PermissionKey>();
  if (stored.length > 0) {
    for (const row of stored) permissions.add(row.key as PermissionKey);
  } else {
    for (const key of keys) {
      const template = ROLE_TEMPLATES[key as SystemRoleKey];
      if (!template) continue;
      for (const permission of template.permissions) permissions.add(permission);
    }
  }

  if (!canDeleteSystemData([...keys].join(","))) {
    for (const permission of NON_SUPER_ADMIN_RECIPIENT_RESTRICTIONS) permissions.delete(permission);
    permissions.add("contacts.read");
    permissions.add("contacts.create");
    permissions.add("contacts.import");
    permissions.add("lists.read");
  }
  return permissions;
}

export async function userHasPermission(
  db: Database,
  account: { id: string; role?: string | null },
  permission: PermissionKey,
) {
  const permissions = await permissionsForUser(db, account);
  return permissions.has(permission);
}
