import { eq, sql } from "drizzle-orm";

import type { Database } from "../db/index.js";
import { appFeatureSettings } from "../db/schema.js";

export const FEATURE_KEYS = [
  "compose",
  "drafts",
  "campaigns",
  "recipients",
  "templates",
  "history",
  "roles",
  "auditLog",
] as const;

export type AppFeatureKey = (typeof FEATURE_KEYS)[number];
export type AppFeatureSettings = {
  features: Record<AppFeatureKey, boolean>;
  allowListCreation: boolean;
};

const DEFAULT_SETTINGS: AppFeatureSettings = {
  features: {
    compose: true,
    drafts: true,
    campaigns: true,
    recipients: true,
    templates: true,
    history: true,
    roles: true,
    auditLog: true,
  },
  allowListCreation: true,
};

let cached: { value: AppFeatureSettings; expiresAt: number } | null = null;
let tableInitialization: Promise<void> | null = null;

function isMissingFeatureSettingsTable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function initializeFeatureSettingsTable(db: Database) {
  if (!tableInitialization) {
    tableInitialization = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS app_feature_settings (
        id text PRIMARY KEY,
        features jsonb NOT NULL,
        allow_list_creation boolean NOT NULL DEFAULT true,
        updated_by text,
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
      await db.insert(appFeatureSettings).values({
        id: "global",
        features: DEFAULT_SETTINGS.features,
        allowListCreation: true,
      }).onConflictDoNothing();
    })().catch((error: unknown) => {
      tableInitialization = null;
      throw error;
    });
  }
  await tableInitialization;
}

function normalize(row?: typeof appFeatureSettings.$inferSelect): AppFeatureSettings {
  if (!row) return DEFAULT_SETTINGS;
  const features = { ...DEFAULT_SETTINGS.features };
  for (const key of FEATURE_KEYS) {
    const value = row.features[key];
    if (typeof value === "boolean") features[key] = value;
  }
  return { features, allowListCreation: row.allowListCreation };
}

export async function getAppFeatureSettings(db: Database) {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let row: typeof appFeatureSettings.$inferSelect | undefined;
  try {
    [row] = await db.select().from(appFeatureSettings).where(eq(appFeatureSettings.id, "global")).limit(1);
  } catch (error) {
    if (!isMissingFeatureSettingsTable(error)) throw error;
    await initializeFeatureSettingsTable(db);
    [row] = await db.select().from(appFeatureSettings).where(eq(appFeatureSettings.id, "global")).limit(1);
  }
  const value = normalize(row);
  cached = { value, expiresAt: Date.now() + 1500 };
  return value;
}

export async function updateAppFeatureSettings(
  db: Database,
  actorUserId: string,
  input: { features?: Partial<Record<AppFeatureKey, boolean>>; allowListCreation?: boolean },
) {
  const current = await getAppFeatureSettings(db);
  const next: AppFeatureSettings = {
    features: { ...current.features, ...input.features },
    allowListCreation: input.allowListCreation ?? current.allowListCreation,
  };
  await db.insert(appFeatureSettings).values({
    id: "global",
    features: next.features,
    allowListCreation: next.allowListCreation,
    updatedBy: actorUserId,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: appFeatureSettings.id,
    set: {
      features: next.features,
      allowListCreation: next.allowListCreation,
      updatedBy: actorUserId,
      updatedAt: new Date(),
    },
  });
  cached = { value: next, expiresAt: Date.now() + 1500 };
  return next;
}
