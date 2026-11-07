import type { Hono } from "hono";

import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { validationError } from "../lib/http-errors.js";
import { getSessionUser } from "../lib/session.js";
import { isQueueEnabled } from "../queue/connection.js";
import { loadQueueEnv } from "../queue/configuration.js";
import {
  enqueueCampaignForSimulation,
  getCampaignQueueSummary,
  getDeliveryJobDetail,
  getQueueOverview,
  listDeliveryJobs,
  listQueueEvents,
  pauseCampaignQueue,
  resumeCampaignQueue,
  retryDeliveryJob,
  serializeDeliveryJob,
} from "../services/queue-service.js";
import { reconcileOrphanedPendingJobs } from "../services/queue-reconciliation.js";
import { serializeCampaign } from "../services/campaigns.js";
import { campaignIdParamSchema } from "../validation/campaigns.js";
import {
  deliveryJobIdParamSchema,
  listQueueEventsQuerySchema,
  listQueueJobsQuerySchema,
} from "../validation/queue.js";

const env = loadEnv();
const db = createLiveDb(env);

export function registerQueueRoutes(app: Hono) {
  app.get("/api/queue/overview", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const overview = await getQueueOverview(db, user.id);
    return c.json(overview);
  });

  app.get("/api/queue/jobs", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const parsed = listQueueJobsQuerySchema.safeParse({
      page: c.req.query("page"),
      limit: c.req.query("limit"),
      status: c.req.query("status"),
      q: c.req.query("q"),
      campaignId: c.req.query("campaignId"),
    });
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const result = await listDeliveryJobs(db, user.id, parsed.data);
    return c.json(result);
  });

  app.get("/api/queue/jobs/:id", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = deliveryJobIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Job not found" }, 404);

    const detail = await getDeliveryJobDetail(db, user.id, params.data.id);
    if (!detail) return c.json({ error: "Job not found" }, 404);
    return c.json(detail);
  });

  app.get("/api/queue/events", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const parsed = listQueueEventsQuerySchema.safeParse({
      campaignId: c.req.query("campaignId"),
      limit: c.req.query("limit"),
    });
    if (!parsed.success) return c.json(validationError(parsed.error), 400);

    const events = await listQueueEvents(db, user.id, parsed.data);
    if (!events) return c.json({ error: "Not found" }, 404);
    return c.json({ events });
  });

  app.get("/api/campaigns/:id/queue", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    const summary = await getCampaignQueueSummary(db, user.id, params.data.id);
    if (!summary) return c.json({ error: "Campaign not found" }, 404);
    return c.json(summary);
  });

  app.post("/api/campaigns/:id/enqueue", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    if (!isQueueEnabled()) {
      return c.json({ error: "Queue is disabled. Set QUEUE_ENABLED=true and start Redis." }, 503);
    }

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    try {
      const result = await enqueueCampaignForSimulation(db, user.id, params.data.id);
      if (!result) return c.json({ error: "Campaign not found" }, 404);
      return c.json({
        campaign: result.campaign ? serializeCampaign(result.campaign) : null,
        created: result.created,
        totalJobs: result.totalJobs,
        idempotent: result.idempotent,
        simulationOnly: loadQueueEnv().QUEUE_SIMULATION_ONLY,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "NOT_ENQUEUEABLE") {
          return c.json({ error: "Campaign cannot be queued in its current state" }, 400);
        }
        if (error.message === "INVALID_CONTENT") {
          return c.json({ error: "Campaign content is incomplete" }, 400);
        }
        if (error.message === "NO_ELIGIBLE_RECIPIENTS") {
          return c.json({ error: "No eligible recipients to enqueue" }, 400);
        }
      }
      throw error;
    }
  });

  app.post("/api/campaigns/:id/pause", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    try {
      const row = await pauseCampaignQueue(db, user.id, params.data.id);
      if (!row) return c.json({ error: "Campaign not found" }, 404);
      return c.json({ campaign: serializeCampaign(row) });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_PAUSABLE") {
        return c.json({ error: "Campaign cannot be paused" }, 400);
      }
      throw error;
    }
  });

  app.post("/api/campaigns/:id/resume", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const params = campaignIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Campaign not found" }, 404);

    try {
      const row = await resumeCampaignQueue(db, user.id, params.data.id);
      if (!row) return c.json({ error: "Campaign not found" }, 404);
      return c.json({ campaign: serializeCampaign(row) });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_RESUMABLE") {
        return c.json({ error: "Campaign cannot be resumed" }, 400);
      }
      throw error;
    }
  });

  app.post("/api/queue/jobs/:id/retry", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    if (!isQueueEnabled()) {
      return c.json({ error: "Queue is disabled" }, 503);
    }

    const params = deliveryJobIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!params.success) return c.json({ error: "Job not found" }, 404);

    try {
      const row = await retryDeliveryJob(db, user.id, params.data.id);
      if (!row) return c.json({ error: "Job not found" }, 404);
      return c.json({ job: serializeDeliveryJob(row) });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_RETRYABLE") {
        return c.json({ error: "Job cannot be retried" }, 400);
      }
      throw error;
    }
  });

  app.post("/api/queue/reconcile", async (c) => {
    const user = await getSessionUser(c.req.raw.headers);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!isQueueEnabled()) return c.json({ error: "Queue is disabled" }, 503);

    const result = await reconcileOrphanedPendingJobs(db);
    return c.json(result);
  });
}
