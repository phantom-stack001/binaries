/** Central audit event taxonomy for Kivorenta (Phase 7.7). */

export const AUDIT_CATEGORIES = [
  "AUTHENTICATION",
  "SECURITY",
  "USER_MANAGEMENT",
  "ROLE_MANAGEMENT",
  "EMAIL",
  "MAILBOX",
  "DRAFT",
  "CONTACT",
  "RECIPIENT_LIST",
  "SUPPRESSION",
  "CAMPAIGN",
  "QUEUE",
  "SETTINGS",
  "ADMINISTRATION",
  "ACTIVITY",
  "SYSTEM",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditActorType = "user" | "system" | "worker";

export const AUDIT_ACTIONS = {
  authSignIn: "auth_sign_in",
  authSignInFailed: "auth_sign_in_failed",
  authSignOut: "auth_sign_out",
  passwordChanged: "password_changed",
  passwordChangeFailed: "password_change_failed",
  twoFactorEnabled: "two_factor_enabled",
  twoFactorDisabled: "two_factor_disabled",
  twoFactorBackupCodesRegenerated: "two_factor_backup_codes_regenerated",
  twoFactorVerifyFailed: "two_factor_verify_failed",
  invitationAccepted: "invitation_accepted",
  invitationCreated: "invitation_created",
  invitationRevoked: "invitation_revoked",
  signupCompleted: "signup_completed",
  signupCodeCreated: "signup_code_created",
  signupCodeRevoked: "signup_code_revoked",
  userCreated: "user.created",
  userUpdated: "user_updated",
  userSuspended: "user_suspended",
  userReactivated: "user_reactivated",
  userDeleted: "user.deleted",
  roleCreated: "role_created",
  roleUpdated: "role_updated",
  roleDeleted: "role_deleted",
  emailSendRequested: "email_send_requested",
  emailSmtpAccepted: "email_smtp_accepted",
  emailSmtpFailed: "email_smtp_failed",
  emailSmtpRejected: "email_smtp_rejected",
  draftCreated: "draft_created",
  draftUpdated: "draft_updated",
  draftDeleted: "draft_deleted",
  contactCreated: "contact_created",
  contactUpdated: "contact_updated",
  contactDeleted: "contact_deleted",
  contactsImported: "contacts_imported",
  contactListCreated: "contact_list_created",
  contactListUpdated: "contact_list_updated",
  contactListDeleted: "contact_list_deleted",
  recipientListMarkedTest: "recipient_list_marked_test",
  recipientListUnmarkedTest: "recipient_list_unmarked_test",
  appFeatureSettingsUpdated: "app_feature_settings_updated",
  testMessageListSendRequested: "test_message_list_send_requested",
  testMessageListSendCompleted: "test_message_list_send_completed",
  testMessageListSendFailed: "test_message_list_send_failed",
  suppressionCreated: "suppression_created",
  campaignSimulationRequested: "campaign_simulation_requested",
  campaignSimulationCompleted: "campaign_simulation_completed",
  campaignSimulationFailed: "campaign_simulation_failed",
  campaignDeliveryRequested: "campaign_delivery_requested",
  campaignDeliveryCompleted: "campaign_delivery_completed",
  campaignDeliveryFailed: "campaign_delivery_failed",
  queueDeliveryJobFailed: "queue_delivery_job_failed",
  campaignCreated: "campaign_created",
  campaignUpdated: "campaign_updated",
  campaignDuplicated: "campaign_duplicated",
  campaignCancelled: "campaign_cancelled",
  campaignRevertedToDraft: "campaign_reverted_to_draft",
  campaignMarkedReady: "campaign_marked_ready",
  campaignDeleted: "campaign_deleted",
  queueSimulationJobFailed: "queue_simulation_job_failed",
  settingsCredentialsUpdated: "settings_credentials_updated",
  adminAccessDenied: "admin_access_denied",
  pageViewed: "page_viewed",
  apiMutation: "api_mutation",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;

const ACTION_LABELS: Record<string, string> = {
  auth_sign_in: "Sign-in succeeded",
  auth_sign_in_failed: "Sign-in failed",
  auth_sign_out: "Signed out",
  password_changed: "Password changed",
  password_change_failed: "Password change failed",
  two_factor_enabled: "Two-factor authentication enabled",
  two_factor_disabled: "Two-factor authentication disabled",
  two_factor_backup_codes_regenerated: "Two-factor backup codes regenerated",
  two_factor_verify_failed: "Two-factor verification failed",
  invitation_accepted: "Invitation accepted",
  invitation_created: "Invitation created",
  invitation_revoked: "Invitation revoked",
  signup_completed: "Role-based signup completed",
  signup_code_created: "Signup code generated",
  signup_code_revoked: "Signup code revoked",
  "user.created": "User account created",
  user_updated: "User account updated",
  user_suspended: "User suspended",
  user_reactivated: "User reactivated",
  "user.deleted": "User account deleted",
  role_created: "Role created",
  role_updated: "Role updated",
  role_deleted: "Role deleted",
  email_send_requested: "Individual email send requested",
  email_smtp_accepted: "SMTP accepted message",
  email_smtp_failed: "SMTP send failed",
  email_smtp_rejected: "SMTP rejected message",
  draft_created: "Draft created",
  draft_updated: "Draft updated",
  draft_deleted: "Draft deleted",
  contact_created: "Contact created",
  contact_updated: "Contact updated",
  contact_deleted: "Contact deleted",
  contacts_imported: "Contacts imported",
  contact_list_created: "Recipient list created",
  contact_list_updated: "Recipient list updated",
  contact_list_deleted: "Recipient list deleted",
  recipient_list_marked_test: "Recipient list marked as a test list",
  recipient_list_unmarked_test: "Recipient list unmarked as a test list",
  test_message_list_send_requested: "Test list send requested",
  test_message_list_send_completed: "Test list send completed",
  test_message_list_send_failed: "Test list send failed",
  suppression_created: "Suppression added",
  campaign_simulation_requested: "Campaign simulation queued",
  campaign_simulation_completed: "Campaign simulation completed",
  campaign_simulation_failed: "Campaign simulation failed",
  campaign_delivery_requested: "Campaign delivery queued",
  campaign_delivery_completed: "Campaign delivery completed",
  campaign_delivery_failed: "Campaign delivery failed",
  queue_delivery_job_failed: "Delivery job failed",
  campaign_created: "Campaign created",
  campaign_updated: "Campaign updated",
  campaign_duplicated: "Campaign duplicated",
  campaign_cancelled: "Campaign cancelled",
  campaign_reverted_to_draft: "Campaign reverted to draft",
  campaign_marked_ready: "Campaign marked ready",
  campaign_deleted: "Campaign deleted",
  queue_simulation_job_failed: "Simulation job failed",
  settings_credentials_updated: "Mailbox credentials updated",
  admin_access_denied: "Administrative access denied",
  manual_email_verified: "Email manually verified",
  page_viewed: "Page viewed",
  api_mutation: "API mutation",
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export function categoryForAction(action: string): AuditCategory {
  if (action.startsWith("auth_") || action.includes("sign_in") || action.includes("sign_out")) {
    return "AUTHENTICATION";
  }
  if (action.includes("password") || action.includes("two_factor")) return "SECURITY";
  if (action.includes("invitation") || action.startsWith("user") || action.startsWith("signup")) {
    return "USER_MANAGEMENT";
  }
  if (action.includes("role")) return "ROLE_MANAGEMENT";
  if (action.startsWith("email_") || action.startsWith("test_message_")) return "EMAIL";
  if (action.includes("draft")) return "DRAFT";
  if (action.startsWith("contact_") && !action.includes("list")) return "CONTACT";
  if (action.includes("contact_list") || action.includes("list_")) return "RECIPIENT_LIST";
  if (action.includes("suppression")) return "SUPPRESSION";
  if (action.startsWith("campaign_")) return "CAMPAIGN";
  if (action.startsWith("queue_")) return "QUEUE";
  if (action.includes("settings") || action.includes("credentials")) return "SETTINGS";
  if (action === "page_viewed" || action === "api_mutation" || action.startsWith("page_")) {
    return "ACTIVITY";
  }
  if (action === "admin_access_denied") return "ADMINISTRATION";
  return "ADMINISTRATION";
}
