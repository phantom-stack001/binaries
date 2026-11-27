import { eq } from "drizzle-orm";

import { parseRoleKeys } from "../auth/permissions.js";
import type { Database } from "../db/index.js";
import { user } from "../db/schema.js";

export type AccountSecurityState = {
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  twoFactorEnforcementRequired: boolean;
  twoFactorEnforcementAfter: string | null;
  isSuperAdmin: boolean;
};

export async function loadAccountSecurityState(
  db: Database,
  userId: string,
): Promise<AccountSecurityState | null> {
  const [row] = await db
    .select({
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorEnforcementAfter: user.twoFactorEnforcementAfter,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return null;
  const isSuperAdmin = parseRoleKeys(row.role).includes("super-admin");
  const enforcementAfter = row.twoFactorEnforcementAfter?.getTime() ?? null;
  const twoFactorEnforcementRequired =
    isSuperAdmin &&
    !row.twoFactorEnabled &&
    enforcementAfter !== null &&
    Date.now() >= enforcementAfter;
  return {
    mustChangePassword: row.mustChangePassword,
    twoFactorEnabled: row.twoFactorEnabled,
    twoFactorEnforcementRequired,
    twoFactorEnforcementAfter: row.twoFactorEnforcementAfter?.toISOString() ?? null,
    isSuperAdmin,
  };
}

function normalizeApiPath(path: string) {
  return (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
}

function pathMatches(path: string, prefix: string) {
  const normalized = normalizeApiPath(path);
  const base = prefix.replace(/\/+$/, "") || "/";
  return normalized === base || normalized.startsWith(`${base}/`);
}

const PASSWORD_CHANGE_ALLOWED_PREFIXES = ["/api/me", "/api/account/change-password", "/api/account/security"];

const TWO_FACTOR_SETUP_ALLOWED_PREFIXES = [
  "/api/me",
  "/api/account/security",
  "/api/account/profile",
  "/api/account/change-password",
];

export function isApiPathAllowedDuringPasswordChange(path: string, method: string): boolean {
  if (method === "OPTIONS") return true;
  if (pathMatches(path, "/api/auth")) return true;
  return PASSWORD_CHANGE_ALLOWED_PREFIXES.some((prefix) => pathMatches(path, prefix));
}

export function isApiPathAllowedDuringTwoFactorSetup(path: string, method: string): boolean {
  if (method === "OPTIONS") return true;
  if (pathMatches(path, "/api/auth")) return true;
  return TWO_FACTOR_SETUP_ALLOWED_PREFIXES.some((prefix) => pathMatches(path, prefix));
}

export function isAppPathAllowedDuringPasswordChange(pathname: string): boolean {
  return pathMatches(pathname, "/app/change-password");
}

export function isAppPathAllowedDuringTwoFactorSetup(pathname: string): boolean {
  return pathMatches(pathname, "/app/settings/security") || pathMatches(pathname, "/app/settings/profile");
}

export const SUPER_ADMIN_2FA_GRACE_DAYS = 14;

export function defaultTwoFactorEnforcementDate(from = new Date()): Date {
  return new Date(from.getTime() + SUPER_ADMIN_2FA_GRACE_DAYS * 24 * 60 * 60 * 1000);
}
