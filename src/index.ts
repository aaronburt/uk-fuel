import { Hono } from "hono";
import { Env } from "./types";
import { fetchAndCacheFuelPrices } from "./cron";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  try {
    const cachedData = await c.env.FUEL_CACHE.get("latest_prices");

    if (!cachedData) {
      return c.json({ error: "No cached data available yet. Please wait for the cronjob." }, 404);
    }

    return new Response(cachedData, {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      500
    );
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      await fetchAndCacheFuelPrices(env);
    } catch (error: any) {
      console.error(`Scheduled execution failed: ${error?.message || error}`);
    }
  },
};
