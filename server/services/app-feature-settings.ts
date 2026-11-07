import { eq } from "drizzle-orm";

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
  const [row] = await db.select().from(appFeatureSettings).where(eq(appFeatureSettings.id, "global")).limit(1);
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
