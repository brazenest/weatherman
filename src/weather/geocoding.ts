/** Client for the Google Maps Geocoding API. */

import type { FetchFn } from './forecast.js';

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Google's formatted address, e.g. "Orlando, FL, USA". */
  address: string;
}

export class LocationNotFoundError extends Error {
  constructor(public readonly query: string) {
    super(`No location found for "${query}"`);
    this.name = 'LocationNotFoundError';
  }
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export class GeocodingClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  /** Looks up a free-form address or place name. */
  locate(address: string): Promise<GeocodeResult> {
    return this.request({ address }, address);
  }

  /** Looks up a postal code. */
  locateByPostalCode(postalCode: string): Promise<GeocodeResult> {
    return this.request({ components: `postal_code:${postalCode}` }, postalCode);
  }

  private async request(params: Record<string, string>, query: string): Promise<GeocodeResult> {
    const url = `${ENDPOINT}?${new URLSearchParams({ ...params, key: this.apiKey })}`;
    const res = await this.fetchFn(url);
    if (!res.ok) {
      throw new Error(`Geocoding API request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as GoogleGeocodeResponse;
    const first = body.results[0];

    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') {
      throw new Error(`Geocoding API error: ${body.status}${body.error_message ? ` (${body.error_message})` : ''}`);
    }
    if (!first) {
      throw new LocationNotFoundError(query);
    }

    return {
      latitude: round3(first.geometry.location.lat),
      longitude: round3(first.geometry.location.lng),
      address: first.formatted_address,
    };
  }
}
