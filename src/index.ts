import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { Env } from "./types";
import { fetchAndCacheFuelPrices } from "./cron";

const app = new Hono<{ Bindings: Env }>();

app.use("*", secureHeaders());
app.use("*", cors({ origin: "*" }));

app.get("/", async (c) => {
  try {
    const cachedData = await c.env.FUEL_CACHE.get("latest_prices");

    if (!cachedData) {
      return c.json({ error: "No cached data available yet. Please wait for the cronjob." }, 404);
    }

    return new Response(cachedData, {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: unknown) {
    console.error("GET / failed:", error instanceof Error ? error.message : String(error));
    return c.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      500
    );
  }
});

app.notFound((c) => {
  return c.json({ success: false, error: "Not Found" }, 404);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      fetchAndCacheFuelPrices(env).catch((error: unknown) => {
        console.error(`Scheduled execution failed: ${error instanceof Error ? error.message : String(error)}`);
      })
    );
  },
};
