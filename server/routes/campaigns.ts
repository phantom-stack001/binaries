import type { Hono } from "hono";

import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { validationError } from "../lib/http-errors.js";
import { resolveRecipientOwnerId } from "../lib/org-workspace.js";
import { getSessionUser } from "../lib/session.js";
import {
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaignDetail,
  getCampaignStats,
  listCampaignEvents,
  listCampaigns,
  prepareCampaign,
  previewRecipientEligibility,
  serializeCampaign,
  updateCampaign,
  validateCampaign,
} from "../services/campaigns.js";
import { cancelCampaignQueue } from "../services/queue-service.js";
import {
  campaignIdParamSchema,
  createCampaignSchema,
  listCampaignsQuerySchema,
  prepareCampaignSchema,
  recipientEligibilityPreviewSchema,
  updateCampaignSchema,
} from "../validation/campaigns.js";

const env = loadEnv();
const db = createLiveDb(env);

export function registerCampaignRoutes(app: Hono) {
  app.get("/api/campaigns/stats", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const stats = await getCampaignStats(db, user.id);
    return c.json({ stats });
  });

  app.get("/api/campaigns", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const parsed = listCampaignsQuerySchema.safeParse({
      page: c.req.query("page"),
      limit: c.req.query("limit"),
      q: c.req.query("q"),
      status: c.req.query("status"),
    });
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const result = await listCampaigns(db, user.id, parsed.data);
    return c.json(result);
  });

  app.post("/api/campaigns", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => ({}));
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const row = await createCampaign(db, user.id, parsed.data);
    return c.json({ campaign: serializeCampaign(row) }, 201);
  });

  app.get("/api/campaigns/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    const detail = await getCampaignDetail(db, user.id, params.data.id);
    if (!detail) return c.json({ error: "Campaign not found" }, 404);

    return c.json(detail);
  });

  app.patch("/api/campaigns/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    try {
      const row = await updateCampaign(
        db,
        user.id,
        params.data.id,
        parsed.data,
        resolveRecipientOwnerId(user),
      );
      if (!row) return c.json({ error: "Campaign not found" }, 404);
      return c.json({ campaign: serializeCampaign(row) });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "REVISION_CONFLICT") {
          return c.json({ error: "Campaign was updated elsewhere. Refresh and try again." }, 409);
        }
        if (error.message === "NOT_EDITABLE" || error.message === "INVALID_TRANSITION") {
          return c.json({ error: "This campaign cannot be edited in its current state" }, 400);
        }
        if (error.message === "DRAFT_NOT_FOUND") {
          return c.json({ error: "Email draft not found" }, 404);
        }
        if (
          error.message === "INVALID_CONTACT_SOURCES" ||
          error.message === "INVALID_LIST_SOURCES"
        ) {
          return c.json({ error: "One or more recipient sources are invalid" }, 400);
        }
        if (error.message === "PAYLOAD_TOO_LARGE") {
          return c.json({ error: "Email content is too large" }, 413);
        }
      }
      throw error;
    }
  });

  app.delete("/api/campaigns/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    try {
      const deleted = await deleteCampaign(db, user.id, params.data.id);
      if (!deleted) return c.json({ error: "Campaign not found" }, 404);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_DELETABLE") {
        return c.json({ error: "Only draft campaigns can be deleted" }, 400);
      }
      throw error;
    }
  });

  app.post("/api/campaigns/:id/duplicate", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    const row = await duplicateCampaign(db, user.id, params.data.id);
    if (!row) return c.json({ error: "Campaign not found" }, 404);

    return c.json({ campaign: serializeCampaign(row) }, 201);
  });

  app.post("/api/campaigns/recipient-eligibility-preview", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => ({}));
    const parsed = recipientEligibilityPreviewSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    try {
      const result = await previewRecipientEligibility(
        db,
        resolveRecipientOwnerId(user),
        parsed.data.contactIds,
        parsed.data.contactListIds,
      );
      return c.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message === "INVALID_CONTACT_SOURCES" ||
          error.message === "INVALID_LIST_SOURCES"
        ) {
          return c.json({ error: "One or more recipient sources are invalid" }, 400);
        }
      }
      throw error;
    }
  });

  app.post("/api/campaigns/:id/validate", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    const result = await validateCampaign(db, user.id, params.data.id, resolveRecipientOwnerId(user));
    if (!result) return c.json({ error: "Campaign not found" }, 404);

    return c.json(result);
  });

  app.post("/api/campaigns/:id/prepare", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const parsed = prepareCampaignSchema.safeParse(body);
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    try {
      const result = await prepareCampaign(
        db,
        user.id,
        params.data.id,
        parsed.data,
        resolveRecipientOwnerId(user),
      );
      if (!result) return c.json({ error: "Campaign not found" }, 404);

      if (parsed.data.markReady && result.contentIssues.length > 0) {
        return c.json(
          {
            error: "Campaign content is incomplete",
            contentIssues: result.contentIssues,
            eligibility: result.eligibility,
          },
          400,
        );
      }

      return c.json({
        campaign: result.campaign ? serializeCampaign(result.campaign) : null,
        contentIssues: result.contentIssues,
        eligibility: result.eligibility,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "NOT_EDITABLE") {
          return c.json({ error: "This campaign cannot be prepared in its current state" }, 400);
        }
        if (error.message === "NAME_REQUIRED") {
          return c.json({ error: "Campaign name is required before marking ready" }, 400);
        }
        if (error.message === "NO_ELIGIBLE_RECIPIENTS") {
          const eligibility =
            (error as Error & { eligibilitySummary?: unknown }).eligibilitySummary ?? null;
          return c.json(
            {
              error:
                "This campaign cannot be marked ready because no eligible recipients are selected.",
              code: "NO_ELIGIBLE_RECIPIENTS",
              eligibility,
            },
            400,
          );
        }
        if (error.message === "SCHEDULE_MUST_BE_FUTURE") {
          return c.json({ error: "Scheduled time must be in the future" }, 400);
        }
        if (error.message === "SCHEDULE_TIMEZONE_REQUIRED") {
          return c.json({ error: "Timezone is required for scheduled campaigns" }, 400);
        }
      }
      throw error;
    }
  });

  app.post("/api/campaigns/:id/cancel", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    try {
      const row = await cancelCampaignQueue(db, user.id, params.data.id);
      if (!row) return c.json({ error: "Campaign not found" }, 404);
      return c.json({ campaign: serializeCampaign(row) });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_CANCELLABLE") {
        return c.json({ error: "This campaign cannot be cancelled" }, 400);
      }
      throw error;
    }
  });

  app.get("/api/campaigns/:id/events", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    const events = await listCampaignEvents(db, user.id, params.data.id);
    if (!events) return c.json({ error: "Campaign not found" }, 404);

    return c.json({ events });
  });
}
