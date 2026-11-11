/**
 * Client for the Pirate Weather API (https://pirateweather.net), a drop-in
 * replacement for the retired Dark Sky API with the same response format.
 */

export const DATA_BLOCKS = ['currently', 'minutely', 'hourly', 'daily', 'alerts', 'flags'] as const;
export type DataBlock = (typeof DATA_BLOCKS)[number];
export type ForecastType = 'currently' | 'hourly' | 'daily';

const ENDPOINT_BASE = 'https://api.pirateweather.net/forecast';

export interface DataPoint {
  time: number;
  summary?: string;
  icon?: string;
  temperature?: number;
  temperatureMax?: number;
  temperatureMin?: number;
  windSpeed?: number;
  windBearing?: number;
  precipType?: string;
}

export interface DataBlockPayload {
  summary?: string;
  icon?: string;
  data: DataPoint[];
}

export interface Alert {
  title: string;
  description: string;
  expires: number;
}

export interface Forecast {
  latitude: number;
  longitude: number;
  timezone: string;
  currently?: DataPoint;
  hourly?: DataBlockPayload;
  daily?: DataBlockPayload;
  alerts?: Alert[];
}

export type FetchFn = typeof fetch;

export class ForecastClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  /** Builds the request URL, excluding every data block except the requested one and alerts. */
  buildUrl(latitude: number, longitude: number, forecastType: ForecastType): string {
    const exclude = DATA_BLOCKS.filter((b) => b !== forecastType && b !== 'alerts');
    const query = new URLSearchParams({ exclude: exclude.join(','), units: 'us' });
    return `${ENDPOINT_BASE}/${encodeURIComponent(this.apiKey)}/${latitude},${longitude}?${query}`;
  }

  async get(latitude: number, longitude: number, forecastType: ForecastType): Promise<Forecast> {
    const res = await this.fetchFn(this.buildUrl(latitude, longitude, forecastType));
    if (!res.ok) {
      throw new Error(`Weather API request failed: HTTP ${res.status}`);
    }
    return (await res.json()) as Forecast;
  }
}
