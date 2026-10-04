import type { RateLimitOptions } from "@fastify/rate-limit";

/**
 * Route config for every endpoint that calls Claude (AGENTS.md: 30/min).
 * Usage: app.post("/route", { config: CLAUDE_ROUTE_RATE_LIMIT }, handler)
 */
export const CLAUDE_ROUTE_RATE_LIMIT: { rateLimit: RateLimitOptions } = {
  rateLimit: { max: 30, timeWindow: "1 minute" },
};
