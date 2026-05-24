import { Env, TokenResponse, FuelPriceResponse } from "./types";

const MAX_BATCHES = 500;
const USER_AGENT = "uk-fuel-worker/1.0";

export async function fetchAndCacheFuelPrices(env: Env): Promise<void> {
  if (!env.CLIENT_ID || !env.CLIENT_SECRET) {
    throw new Error("CLIENT_ID and CLIENT_SECRET environment variables must be defined");
  }

  const tokenUrl = "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token";
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", env.CLIENT_ID);
  params.append("client_secret", env.CLIENT_SECRET);

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: params.toString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Token request network failure: ${message}`);
  }

  if (!tokenResponse.ok) {
    let errorBody = "";
    try {
      errorBody = await tokenResponse.text();
    } catch {
      errorBody = "Unable to read error body";
    }
    throw new Error(`Token request failed with status ${tokenResponse.status}: ${errorBody}`);
  }

  let tokenData: TokenResponse;
  try {
    tokenData = await tokenResponse.json<TokenResponse>();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse token response JSON: ${message}`);
  }

  const accessToken = tokenData?.data?.access_token || tokenData?.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error(`Invalid or missing access_token in token response. Received payload: ${JSON.stringify(tokenData)}`);
  }

  let batchNumber = 1;
  const allBatches: FuelPriceResponse[] = [];

  while (batchNumber <= MAX_BATCHES) {
    const pricesUrl = `https://www.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices?batch-number=${batchNumber}`;
    let pricesResponse: Response;
    try {
      pricesResponse = await fetch(pricesUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
          "User-Agent": USER_AGENT,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Fuel prices request network failure on batch ${batchNumber}: ${message}`);
    }

    if (!pricesResponse.ok) {
      if (pricesResponse.status === 400 || pricesResponse.status === 404) {
        break;
      }
      let errorBody = "";
      try {
        errorBody = await pricesResponse.text();
      } catch {
        errorBody = "Unable to read error body";
      }
      throw new Error(`Fuel prices request failed on batch ${batchNumber} with status ${pricesResponse.status}: ${errorBody}`);
    }

    let pricesData: FuelPriceResponse;
    try {
      pricesData = await pricesResponse.json<FuelPriceResponse>();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse fuel prices JSON on batch ${batchNumber}: ${message}`);
    }

    allBatches.push(pricesData);

    const stations = pricesData?.data && !Array.isArray(pricesData.data)
      ? pricesData.data.stations
      : pricesData?.stations;

    if (Array.isArray(stations) && stations.length === 0) {
      break;
    }

    const dataPayload = pricesData?.data || pricesData;
    if (Array.isArray(dataPayload) && dataPayload.length === 0) {
      break;
    }

    batchNumber++;
  }

  if (batchNumber > MAX_BATCHES) {
    console.warn(`Reached MAX_BATCHES limit (${MAX_BATCHES}). Data may be incomplete.`);
  }

  try {
    await env.FUEL_CACHE.put("latest_prices", JSON.stringify(allBatches));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to save prices to KV: ${message}`);
  }
}
