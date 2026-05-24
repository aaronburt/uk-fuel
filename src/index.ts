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
    let cachedData = await c.env.FUEL_CACHE.get("latest_prices");

    if (!cachedData) {
      const lock = await c.env.FUEL_CACHE.get("fetch_lock");

      if (lock) {
        await new Promise((r) => setTimeout(r, 3000));
        cachedData = await c.env.FUEL_CACHE.get("latest_prices");
      } else {
        await c.env.FUEL_CACHE.put("fetch_lock", "1", { expirationTtl: 120 });
        try {
          await fetchAndCacheFuelPrices(c.env);
        } finally {
          await c.env.FUEL_CACHE.delete("fetch_lock");
        }
        cachedData = await c.env.FUEL_CACHE.get("latest_prices");
      }
    }

    if (!cachedData) {
      return c.json({ success: false, error: "Failed to fetch fuel prices" }, 502);
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
