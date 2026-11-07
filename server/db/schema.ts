import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorEnforcementAfter: timestamp("two_factor_enforcement_after"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const twoFactor = pgTable(
  "twoFactor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (table) => [uniqueIndex("twoFactor_user_id_unique").on(table.userId)],
);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailDrafts = pgTable(
  "email_drafts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    senderName: text("sender_name").notNull().default(""),
    senderEmail: text("sender_email").notNull().default(""),
    subject: text("subject").notNull().default(""),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>(),
    bodyHtml: text("body_html").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("email_drafts_user_id_updated_at_idx").on(table.userId, table.updatedAt),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    company: text("company").notNull().default(""),
    phone: text("phone").notNull().default(""),
    subscriptionStatus: text("subscription_status").notNull().default("unknown"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("contacts_user_id_email_unique").on(table.userId, table.email),
    index("contacts_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("contacts_user_id_status_idx").on(table.userId, table.subscriptionStatus),
  ],
);

export const contactLists = pgTable(
  "contact_lists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isTestList: boolean("is_test_list").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("contact_lists_user_id_name_unique").on(table.userId, table.name),
    index("contact_lists_user_id_updated_at_idx").on(table.userId, table.updatedAt),
  ],
);

export const contactListMembers = pgTable(
  "contact_list_members",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => contactLists.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contact_list_members_list_contact_unique").on(table.listId, table.contactId),
    index("contact_list_members_contact_id_idx").on(table.contactId),
  ],
);

export const contactConsentEvents = pgTable(
  "contact_consent_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    source: text("source").notNull().default(""),
    occurredAt: timestamp("occurred_at").notNull(),
    recordedAt: timestamp("recorded_at").defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("contact_consent_events_contact_id_idx").on(table.contactId),
    index("contact_consent_events_user_id_idx").on(table.userId),
  ],
);

export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("email_suppressions_user_id_email_unique").on(table.userId, table.email),
    index("email_suppressions_user_id_reason_idx").on(table.userId, table.reason),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    sourceDraftId: text("source_draft_id").references(() => emailDrafts.id, {
      onDelete: "set null",
    }),
    senderName: text("sender_name").notNull().default(""),
    senderEmail: text("sender_email").notNull().default(""),
    subject: text("subject").notNull().default(""),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>(),
    bodyHtml: text("body_html").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    contentRevision: integer("content_revision").notNull().default(1),
    revision: integer("revision").notNull().default(1),
    scheduledAt: timestamp("scheduled_at"),
    scheduleTimezone: text("schedule_timezone"),
    eligibleRecipientCount: integer("eligible_recipient_count").notNull().default(0),
    queuePaused: boolean("queue_paused").notNull().default(false),
    queueGeneration: integer("queue_generation").notNull().default(0),
    enqueuedAt: timestamp("enqueued_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("campaigns_user_id_updated_at_idx").on(table.userId, table.updatedAt),
    index("campaigns_user_id_status_idx").on(table.userId, table.status),
  ],
);

export const campaignRecipientSources = pgTable(
  "campaign_recipient_sources",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    contactListId: text("contact_list_id").references(() => contactLists.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("campaign_recipient_sources_campaign_id_idx").on(table.campaignId),
    uniqueIndex("campaign_recipient_sources_individual_unique").on(
      table.campaignId,
      table.contactId,
    ),
    uniqueIndex("campaign_recipient_sources_list_unique").on(
      table.campaignId,
      table.contactListId,
    ),
  ],
);

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    eligibilityStatus: text("eligibility_status").notNull(),
    eligibilityReason: text("eligibility_reason").notNull().default(""),
    evaluatedAt: timestamp("evaluated_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaign_recipients_campaign_email_unique").on(table.campaignId, table.email),
    index("campaign_recipients_campaign_id_idx").on(table.campaignId),
  ],
);

export const campaignEvents = pgTable(
  "campaign_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("campaign_events_campaign_id_created_at_idx").on(table.campaignId, table.createdAt)],
);

export const deliveryJobs = pgTable(
  "delivery_jobs",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    campaignRecipientId: text("campaign_recipient_id")
      .notNull()
      .references(() => campaignRecipients.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    bullmqJobId: text("bullmq_job_id"),
    queueGeneration: integer("queue_generation").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    scheduledAt: timestamp("scheduled_at"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    skipReason: text("skip_reason"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("delivery_jobs_campaign_recipient_generation_unique").on(
      table.campaignId,
      table.campaignRecipientId,
      table.queueGeneration,
    ),
    index("delivery_jobs_user_id_status_idx").on(table.userId, table.status),
    index("delivery_jobs_campaign_id_idx").on(table.campaignId),
    index("delivery_jobs_status_scheduled_idx").on(table.status, table.scheduledAt),
  ],
);

export const deliveryJobAttempts = pgTable(
  "delivery_job_attempts",
  {
    id: text("id").primaryKey(),
    deliveryJobId: text("delivery_job_id")
      .notNull()
      .references(() => deliveryJobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("delivery_job_attempts_delivery_job_id_idx").on(table.deliveryJobId),
  ],
);

export const queueEvents = pgTable(
  "queue_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    deliveryJobId: text("delivery_job_id").references(() => deliveryJobs.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("queue_events_campaign_id_created_at_idx").on(table.campaignId, table.createdAt),
    index("queue_events_delivery_job_id_idx").on(table.deliveryJobId),
  ],
);

export const mailConnectionChecks = pgTable(
  "mail_connection_checks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    smtpStatus: text("smtp_status").notNull(),
    imapStatus: text("imap_status").notNull(),
    smtpError: text("smtp_error"),
    imapError: text("imap_error"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (table) => [index("mail_connection_checks_checked_at_idx").on(table.checkedAt)],
);

export const testMessageOperations = pgTable(
  "test_message_operations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    listId: text("list_id").references(() => contactLists.id, { onDelete: "set null" }),
    listName: text("list_name").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull(),
    requestedCount: integer("requested_count").notNull().default(0),
    eligibleCount: integer("eligible_count").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    unknownCount: integer("unknown_count").notNull().default(0),
    notAttemptedCount: integer("not_attempted_count").notNull().default(0),
    failureCategory: text("failure_category"),
    recipientSnapshot: jsonb("recipient_snapshot")
      .$type<{ contactId: string; email: string }[]>()
      .notNull()
      .default([]),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("test_message_operations_idempotency_key_unique").on(table.idempotencyKey),
    index("test_message_operations_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const mailSubmissions = pgTable(
  "mail_submissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    operationId: text("operation_id").references(() => testMessageOperations.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    messageId: text("message_id"),
    status: text("status").notNull(),
    smtpResponse: text("smtp_response"),
    acceptedRecipients: jsonb("accepted_recipients").$type<string[]>().notNull().default([]),
    rejectedRecipients: jsonb("rejected_recipients").$type<string[]>().notNull().default([]),
    sentCopyStatus: text("sent_copy_status"),
    sentCopyError: text("sent_copy_error"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("mail_submissions_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("mail_submissions_operation_contact_unique")
      .on(table.operationId, table.contactId)
      .where(sql`${table.operationId} is not null and ${table.contactId} is not null`),
    uniqueIndex("mail_submissions_operation_email_unique")
      .on(table.operationId, sql`lower(${table.toAddress})`)
      .where(sql`${table.operationId} is not null`),
    index("mail_submissions_created_at_idx").on(table.createdAt),
  ],
);

export const individualEmailSubmissions = pgTable(
  "individual_email_submissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceDraftId: text("source_draft_id").references(() => emailDrafts.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull(),
    messageId: text("message_id"),
    senderEmail: text("sender_email").notNull(),
    toRecipients: jsonb("to_recipients").$type<string[]>().notNull().default([]),
    ccRecipients: jsonb("cc_recipients").$type<string[]>().notNull().default([]),
    bccRecipients: jsonb("bcc_recipients").$type<string[]>().notNull().default([]),
    recipientSummary: text("recipient_summary").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull(),
    smtpAcceptedAt: timestamp("smtp_accepted_at"),
    sentCopySavedAt: timestamp("sent_copy_saved_at"),
    sentCopyStatus: text("sent_copy_status"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("individual_email_submissions_idempotency_key_unique").on(table.idempotencyKey),
    index("individual_email_submissions_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const appRoles = pgTable("app_roles", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appPermissions = pgTable("app_permissions", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
});

export const appRolePermissions = pgTable(
  "app_role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => appRoles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => appPermissions.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const appUserRoles = pgTable(
  "app_user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => appRoles.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by").references(() => user.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const appUserAccess = pgTable("app_user_access", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const adminAuditEvents = pgTable(
  "admin_audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    targetUserId: text("target_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    eventType: text("event_type"),
    category: text("category"),
    result: text("result").notNull().default("success"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    description: text("description"),
    requestId: text("request_id"),
    actorType: text("actor_type").notNull().default("user"),
    actorEmail: text("actor_email"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_events_created_at_idx").on(table.createdAt),
    index("admin_audit_events_actor_idx").on(table.actorUserId),
    index("admin_audit_events_target_idx").on(table.targetUserId),
    index("admin_audit_events_event_type_idx").on(table.eventType),
    index("admin_audit_events_category_idx").on(table.category),
    index("admin_audit_events_result_idx").on(table.result),
    index("admin_audit_events_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export const userInvitations = pgTable(
  "user_invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    inviteeName: text("invitee_name"),
    roleKeys: jsonb("role_keys").$type<string[]>().notNull().default([]),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    revokedAt: timestamp("revoked_at"),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    deliveryStatus: text("delivery_status").notNull().default("pending"),
    deliveryError: text("delivery_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_invitations_token_hash_unique").on(table.tokenHash),
    index("user_invitations_email_idx").on(table.email),
  ],
);

export const signupCodes = pgTable(
  "signup_codes",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    roleKey: text("role_key").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("signup_codes_created_by_created_at_idx").on(table.createdBy, table.createdAt),
    index("signup_codes_expires_at_idx").on(table.expiresAt),
  ],
);

export const mailDeliverySettings = pgTable(
  "mail_delivery_settings",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull().default("resend"),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [check("mail_delivery_settings_provider_check", sql`${table.provider} in ('resend', 'spacemail')`)],
);

export const appFeatureSettings = pgTable("app_feature_settings", {
  id: text("id").primaryKey(),
  features: jsonb("features").$type<Record<string, boolean>>().notNull(),
  allowListCreation: boolean("allow_list_creation").notNull().default(true),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
