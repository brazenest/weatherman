/**
 * JSON forecast API for programmatic clients such as the Weatherman Slack agent.
 *
 *   GET /api/forecast?place=<place>&type=currently|hourly|daily
 *   Authorization: Bearer <AGENT_API_TOKEN>
 *
 * `place` is optional and defaults to the configured default location.
 * The endpoint is disabled (404) unless AGENT_API_TOKEN is set.
 */

import type { Config } from '../config.js';
import type { Logger } from '../slack/handler.js';
import type { WeatherServices } from '../slack/weatherCommand.js';
import type { Alert, DataPoint, Forecast, ForecastType } from '../weather/forecast.js';
import { LocationNotFoundError } from '../weather/geocoding.js';

export const API_FORECAST_PATH = '/api/forecast';

const FORECAST_TYPES: readonly ForecastType[] = ['currently', 'hourly', 'daily'];
const MAX_PLACE_LENGTH = 200;
const HOURS = 12;
const DAYS = 7;

export interface ForecastResponse {
  location: { label: string; latitude: number; longitude: number; isDefault: boolean };
  type: ForecastType;
  units: 'us';
  timezone: string;
  summary?: string;
  currently?: DataPoint;
  hourly?: DataPoint[];
  daily?: DataPoint[];
  alerts: Alert[];
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

/** Compares two strings without returning early on the first differing byte. */
export function tokensMatch(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a[i] ?? 0) ^ b[i]!;
  }
  return diff === 0;
}

export function toForecastResponse(
  forecast: Forecast,
  type: ForecastType,
  location: ForecastResponse['location'],
): ForecastResponse {
  const out: ForecastResponse = {
    location,
    type,
    units: 'us',
    timezone: forecast.timezone,
    alerts: (forecast.alerts ?? []).map(({ title, description, expires }) => ({ title, description, expires })),
  };
  if (type === 'currently') {
    if (!forecast.currently) throw new Error('Weather API response is missing current conditions');
    out.currently = forecast.currently;
  } else {
    const block = forecast[type];
    if (!block) throw new Error(`Weather API response is missing the ${type} forecast`);
    if (block.summary) out.summary = block.summary;
    out[type] = block.data.slice(0, type === 'hourly' ? HOURS : DAYS);
  }
  return out;
}

export async function handleApiRequest(
  request: Request,
  config: Config,
  services: WeatherServices,
  logger: Logger = console,
): Promise<Response> {
  const url = new URL(request.url);
  if (!config.agentApiToken || url.pathname !== API_FORECAST_PATH) {
    return json({ error: 'not_found' }, 404);
  }
  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }

  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !tokensMatch(token, config.agentApiToken)) {
    return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
  }

  const type = (url.searchParams.get('type') ?? 'currently') as ForecastType;
  if (!FORECAST_TYPES.includes(type)) {
    return json({ error: 'invalid_type', allowed: FORECAST_TYPES }, 400);
  }
  const place = url.searchParams.get('place')?.trim() ?? '';
  if (place.length > MAX_PLACE_LENGTH) {
    return json({ error: 'place_too_long' }, 400);
  }

  try {
    let location: ForecastResponse['location'] = {
      label: config.defaultLocation.label,
      latitude: config.defaultLocation.latitude,
      longitude: config.defaultLocation.longitude,
      isDefault: true,
    };
    if (place) {
      const geo = await services.geocode(place);
      location = { label: geo.address, latitude: geo.latitude, longitude: geo.longitude, isDefault: false };
    }
    const forecast = await services.forecast(location.latitude, location.longitude, type);
    return json(toForecastResponse(forecast, type, location));
  } catch (error) {
    if (error instanceof LocationNotFoundError) {
      return json({ error: 'location_not_found', place }, 404);
    }
    logger.error(JSON.stringify({ message: 'api forecast failed', error: String(error), place, type }));
    return json({ error: 'upstream_error' }, 502);
  }
}
