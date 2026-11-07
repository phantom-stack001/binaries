import type { Hono } from "hono";

import { createLiveDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { validationError } from "../lib/http-errors.js";
import { clientIpFromRequest, userAgentFromRequest } from "../lib/request-context.js";
import { getSessionUser } from "../lib/session.js";
import { pageViewBodySchema, recordPageViewActivity } from "../services/page-view-activity.js";

const env = loadEnv();
const db = createLiveDb(env);

export function registerActivityRoutes(app: Hono) {
  app.post("/api/activity/page-view", async (c) => {
    try {
      const user = await getSessionUser(c.req.raw.headers);
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json().catch(() => null);
      const parsed = pageViewBodySchema.safeParse(body);
      if (!parsed.success) return c.json(validationError(parsed.error), 400);

      const result = await recordPageViewActivity(db, {
        actorUserId: user.id,
        actorEmail: user.email,
        path: parsed.data.path,
        title: parsed.data.title,
        requestContext: {
          ipAddress: clientIpFromRequest(c),
          userAgent: userAgentFromRequest(c),
        },
      });

      return c.json(result);
    } catch {
      // Silent failure: never surface activity logging as a user-facing alert.
      return c.json({ ok: true, deduped: true });
    }
  });
}
