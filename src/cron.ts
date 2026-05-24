import { Env } from "./types";

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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: params.toString(),
    });
  } catch (error: any) {
    throw new Error(`Token request network failure: ${error?.message || error}`);
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

  let tokenData: any;
  try {
    tokenData = await tokenResponse.json();
  } catch (error: any) {
    throw new Error(`Failed to parse token response JSON: ${error?.message || error}`);
  }

  const accessToken = tokenData?.data?.access_token || tokenData?.access_token;
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error(`Invalid or missing access_token in token response. Received payload: ${JSON.stringify(tokenData)}`);
  }

  let batchNumber = 1;
  const allBatches: any[] = [];

  while (true) {
    const pricesUrl = `https://www.fuel-finder.service.gov.uk/api/v1/pfs/fuel-prices?batch-number=${batchNumber}`;
    let pricesResponse: Response;
    try {
      pricesResponse = await fetch(pricesUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
    } catch (error: any) {
      throw new Error(`Fuel prices request network failure on batch ${batchNumber}: ${error?.message || error}`);
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

    let pricesData: any;
    try {
      pricesData = await pricesResponse.json();
    } catch (error: any) {
      throw new Error(`Failed to parse fuel prices JSON on batch ${batchNumber}: ${error?.message || error}`);
    }

    allBatches.push(pricesData);

    const stations = pricesData?.data?.stations || pricesData?.stations;
    if (Array.isArray(stations) && stations.length === 0) {
      break;
    }

    const dataPayload = pricesData?.data || pricesData;
    if (Array.isArray(dataPayload) && dataPayload.length === 0) {
      break;
    }
    
    batchNumber++;
  }

  try {
    await env.FUEL_CACHE.put("latest_prices", JSON.stringify(allBatches));
  } catch (error: any) {
    throw new Error(`Failed to save prices to KV: ${error?.message || error}`);
  }
}
