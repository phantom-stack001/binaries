/**
 * Application permission registry.
 * Better Auth remains authoritative for accounts, passwords, sessions, and the user.role string.
 * These keys are authoritative for SendStack feature access.
 */
export const PERMISSIONS = [
  "users.read",
  "users.create",
  "users.update",
  "users.deactivate",
  "users.delete",
  "users.invite",
  "users.reset_password",
  "users.manage_sessions",
  "roles.read",
  "roles.create",
  "roles.update",
  "roles.delete",
  "roles.assign",
  "permissions.read",
  "permissions.manage",
  "drafts.read",
  "drafts.create",
  "drafts.update",
  "drafts.delete",
  "templates.read",
  "templates.create",
  "templates.update",
  "templates.delete",
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "contacts.delete",
  "contacts.import",
  "contacts.export",
  "lists.read",
  "lists.create",
  "lists.update",
  "lists.delete",
  "campaigns.read",
  "campaigns.create",
  "campaigns.update",
  "campaigns.delete",
  "campaigns.prepare",
  "campaigns.cancel",
  "queue.read",
  "queue.enqueue",
  "queue.pause",
  "queue.resume",
  "queue.cancel",
  "queue.retry",
  "mailbox.read",
  "mailbox.send_test",
  "mailbox.send",
  "mailbox.manage_connection",
  "history.read",
  "settings.read",
  "settings.update",
  "audit.read",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const PERMISSION_DETAILS: Record<PermissionKey, { category: string; description: string }> = {
  "users.read": { category: "Users", description: "View user accounts" },
  "users.create": { category: "Users", description: "Create user accounts" },
  "users.update": { category: "Users", description: "Update user profiles and status" },
  "users.deactivate": { category: "Users", description: "Suspend or deactivate accounts" },
  "users.delete": { category: "Users", description: "Delete accounts when retention allows it" },
  "users.invite": { category: "Users", description: "Invite users by email" },
  "users.reset_password": { category: "Users", description: "Start a password reset for a user" },
  "users.manage_sessions": { category: "Users", description: "View and revoke sessions" },
  "roles.read": { category: "Roles", description: "View roles" },
  "roles.create": { category: "Roles", description: "Create custom roles" },
  "roles.update": { category: "Roles", description: "Edit custom roles" },
  "roles.delete": { category: "Roles", description: "Delete custom roles" },
  "roles.assign": { category: "Roles", description: "Assign roles to users" },
  "permissions.read": { category: "Permissions", description: "View the permission registry" },
  "permissions.manage": { category: "Permissions", description: "Change which permissions a custom role has" },
  "drafts.read": { category: "Drafts", description: "View drafts you are allowed to access" },
  "drafts.create": { category: "Drafts", description: "Create drafts" },
  "drafts.update": { category: "Drafts", description: "Edit drafts you are allowed to access" },
  "drafts.delete": { category: "Drafts", description: "Delete drafts you are allowed to access" },
  "templates.read": { category: "Templates", description: "View templates" },
  "templates.create": { category: "Templates", description: "Create templates" },
  "templates.update": { category: "Templates", description: "Edit templates" },
  "templates.delete": { category: "Templates", description: "Delete templates" },
  "contacts.read": { category: "Contacts", description: "View contacts you are allowed to access" },
  "contacts.create": { category: "Contacts", description: "Create contacts" },
  "contacts.update": { category: "Contacts", description: "Edit contacts you are allowed to access" },
  "contacts.delete": { category: "Contacts", description: "Delete contacts you are allowed to access" },
  "contacts.import": { category: "Contacts", description: "Import contacts" },
  "contacts.export": { category: "Contacts", description: "Export contacts" },
  "lists.read": { category: "Lists", description: "View contact lists you are allowed to access" },
  "lists.create": { category: "Lists", description: "Create contact lists" },
  "lists.update": { category: "Lists", description: "Edit contact lists you are allowed to access" },
  "lists.delete": { category: "Lists", description: "Delete contact lists you are allowed to access" },
  "campaigns.read": { category: "Campaigns", description: "View campaigns you are allowed to access" },
  "campaigns.create": { category: "Campaigns", description: "Create campaigns" },
  "campaigns.update": { category: "Campaigns", description: "Edit campaigns you are allowed to access" },
  "campaigns.delete": { category: "Campaigns", description: "Delete campaigns you are allowed to access" },
  "campaigns.prepare": { category: "Campaigns", description: "Prepare a campaign snapshot" },
  "campaigns.cancel": { category: "Campaigns", description: "Cancel a campaign" },
  "queue.read": { category: "Queue", description: "View queue jobs you are allowed to access" },
  "queue.enqueue": { category: "Queue", description: "Enqueue a simulation job" },
  "queue.pause": { category: "Queue", description: "Pause queue processing" },
  "queue.resume": { category: "Queue", description: "Resume queue processing" },
  "queue.cancel": { category: "Queue", description: "Cancel queue jobs" },
  "queue.retry": { category: "Queue", description: "Retry queue jobs" },
  "mailbox.read": { category: "Mailbox", description: "Read the shared mailbox" },
  "mailbox.send_test": {
    category: "Mailbox",
    description: "Send a controlled test message to one allowlisted recipient or a designated test list",
  },
  "mailbox.send": { category: "Mailbox", description: "Send an individual email from the composer" },
  "mailbox.manage_connection": { category: "Mailbox", description: "Test the mailbox connection" },
  "history.read": { category: "History", description: "View sending history" },
  "settings.read": { category: "Settings", description: "View settings" },
  "settings.update": { category: "Settings", description: "Update settings" },
  "audit.read": { category: "Audit", description: "View administrative audit events" },
};

const READ_ONLY = [
  "drafts.read",
  "templates.read",
  "contacts.read",
  "lists.read",
  "campaigns.read",
  "queue.read",
  "history.read",
  "settings.read",
] as const satisfies readonly PermissionKey[];

const EDITOR = [
  ...READ_ONLY,
  "drafts.create",
  "drafts.update",
  "templates.create",
  "templates.update",
] as const satisfies readonly PermissionKey[];

const CAMPAIGN_MANAGER = [
  ...EDITOR,
  "contacts.create",
  "contacts.import",
  "campaigns.create",
  "campaigns.update",
  "campaigns.prepare",
  "campaigns.cancel",
  "queue.enqueue",
  "queue.pause",
  "queue.resume",
  "queue.cancel",
  "queue.retry",
] as const satisfies readonly PermissionKey[];

const ADMIN = [
  ...CAMPAIGN_MANAGER,
  "users.read",
  "users.create",
  "users.update",
  "users.deactivate",
  "users.invite",
  "users.reset_password",
  "users.manage_sessions",
  "roles.read",
  "permissions.read",
  "audit.read",
  "mailbox.send_test",
] as const satisfies readonly PermissionKey[];

export const SYSTEM_ROLE_KEYS = [
  "super-admin",
  "admin",
  "campaign-manager",
  "editor",
  "viewer",
  "user",
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export const SIGNUP_ROLE_KEYS = ["admin", "campaign-manager", "editor", "viewer", "user"] as const;
export type SignupRoleKey = (typeof SIGNUP_ROLE_KEYS)[number];

export const RESERVED_ROLE_KEYS = new Set<string>(SYSTEM_ROLE_KEYS);

export const ROLE_TEMPLATES: Record<SystemRoleKey, { name: string; description: string; permissions: readonly PermissionKey[] }> = {
  "super-admin": {
    name: "Super admin",
    description: "Full administrative access, including the shared mailbox and role management.",
    permissions: PERMISSIONS,
  },
  admin: {
    name: "Admin",
    description:
      "Manage users within policy, plus campaigns, contacts, and drafts. Can send controlled test messages; no shared mailbox or provider configuration.",
    permissions: ADMIN,
  },
  "campaign-manager": {
    name: "Campaign manager",
    description: "Create and update campaigns and recipients, and manage simulation queue actions.",
    permissions: CAMPAIGN_MANAGER,
  },
  editor: {
    name: "Editor",
    description: "Create and edit drafts and templates.",
    permissions: EDITOR,
  },
  viewer: {
    name: "Viewer",
    description: "View authorized resources. Cannot create, edit, or delete.",
    permissions: READ_ONLY,
  },
  user: {
    name: "User",
    description: "Default self-service account. Keeps existing owner access to drafts, contacts, and campaigns.",
    permissions: CAMPAIGN_MANAGER,
  },
};

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function parseRoleKeys(role: string | null | undefined) {
  return [...new Set((role ?? "").split(",").map((part) => part.trim()).filter(Boolean))];
}

export function permissionForRequest(path: string, method: string): PermissionKey | null {
  const normalized = path.split("?")[0] ?? path;
  if (
    normalized.startsWith("/api/auth") ||
    normalized.startsWith("/api/health") ||
    normalized === "/api/me" ||
    normalized.startsWith("/api/account/") ||
    normalized.startsWith("/api/activity/") ||
    normalized.startsWith("/api/invitations/accept")
  ) {
    return null;
  }

  if (normalized.startsWith("/api/admin/audit")) return "audit.read";
  if (normalized.startsWith("/api/admin/permissions")) return "permissions.read";
  if (normalized.startsWith("/api/admin/roles")) {
    if (method === "GET") return "roles.read";
    if (method === "POST") return "roles.create";
    if (method === "DELETE") return "roles.delete";
    return "roles.update";
  }
  if (normalized.startsWith("/api/admin/invitations")) return "users.invite";
  if (normalized.startsWith("/api/admin/users")) {
    if (normalized.endsWith("/sessions") && method === "DELETE") return "users.manage_sessions";
    if (normalized.endsWith("/password-reset")) return "users.reset_password";
    if (normalized.endsWith("/password") && method === "POST") return "users.update";
    if (normalized.endsWith("/status")) return "users.deactivate";
    if (normalized.endsWith("/verify-email") && method === "POST") return null;
    if (method === "GET") return "users.read";
    if (method === "POST") return normalized.endsWith("/invite") ? "users.invite" : "users.create";
    if (method === "DELETE") return "users.delete";
    return "users.update";
  }
  if (normalized.startsWith("/api/mail")) {
    if (normalized === "/api/mail/send" || normalized.startsWith("/api/mail/sends")) return "mailbox.send";
    if (
      normalized === "/api/mail/test-lists" ||
      normalized === "/api/mail/test-send-context" ||
      normalized.endsWith("/test-send")
    ) {
      return "mailbox.send_test";
    }
    if (normalized.endsWith("/test-connection")) return "mailbox.manage_connection";
    return "mailbox.read";
  }
  if (normalized.startsWith("/api/queue")) {
    if (method === "GET") return "queue.read";
    if (normalized.includes("/pause")) return "queue.pause";
    if (normalized.includes("/resume")) return "queue.resume";
    if (normalized.includes("/cancel")) return "queue.cancel";
    if (normalized.includes("/retry")) return "queue.retry";
    if (normalized.includes("/reconcile") || normalized.includes("/enqueue")) return "queue.enqueue";
    return "queue.read";
  }
  if (normalized.startsWith("/api/campaigns")) {
    if (normalized.endsWith("/cancel")) return "campaigns.cancel";
    if (normalized.endsWith("/prepare")) return "campaigns.prepare";
    if (normalized.endsWith("/enqueue")) return "queue.enqueue";
    if (method === "GET") return "campaigns.read";
    if (method === "DELETE") return "campaigns.delete";
    if (method === "POST" && normalized === "/api/campaigns") return "campaigns.create";
    return "campaigns.update";
  }
  if (normalized.startsWith("/api/contact-import")) return "contacts.import";
  if (normalized.startsWith("/api/contact-lists") || normalized.startsWith("/api/lists")) {
    if (method === "GET") return "lists.read";
    if (method === "POST") return "lists.create";
    if (method === "DELETE") return "lists.delete";
    return "lists.update";
  }
  if (normalized.startsWith("/api/contacts") || normalized.startsWith("/api/suppressions")) {
    if (method === "GET") return "contacts.read";
    if (method === "POST") return "contacts.create";
    if (method === "DELETE") return "contacts.delete";
    return "contacts.update";
  }
  if (normalized.startsWith("/api/drafts")) {
    if (method === "GET") return "drafts.read";
    if (method === "POST") return "drafts.create";
    if (method === "DELETE") return "drafts.delete";
    return "drafts.update";
  }
  return null;
}
