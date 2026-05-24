export interface Env {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  FUEL_CACHE: KVNamespace;
}

export interface TokenResponse {
  access_token?: string;
  data?: {
    access_token?: string;
  };
}

export interface FuelStation {
  site_id: string;
  brand: string;
  address: string;
  postcode: string;
  location: {
    latitude: number;
    longitude: number;
  };
  prices: Record<string, number | null>;
}

export interface FuelPriceResponse {
  stations?: FuelStation[];
  data?: {
    stations?: FuelStation[];
  } | FuelStation[];
}
