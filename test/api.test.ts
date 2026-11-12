import { describe, expect, it, vi } from 'vitest';

import { type ForecastResponse, handleApiRequest, tokensMatch } from '../src/api/forecast.js';
import type { Config } from '../src/config.js';
import type { WeatherServices } from '../src/slack/weatherCommand.js';
import type { Forecast } from '../src/weather/forecast.js';
import { LocationNotFoundError } from '../src/weather/geocoding.js';

const TOKEN = 'test-agent-token';

const config: Config = {
  slackSigningSecret: 's',
  pirateWeatherApiKey: 'k',
  googleGeocodingApiKey: 'k',
  agentApiToken: TOKEN,
  adminUserIds: [],
  adminTeamIds: [],
  defaultLocation: { latitude: 1, longitude: 2, label: 'at HQ' },
};

const forecast: Forecast = {
  latitude: 28.5,
  longitude: -81.4,
  timezone: 'America/New_York',
  currently: { time: 1_800_000_000, summary: 'Clear', icon: 'clear-day', temperature: 75.4 },
  hourly: {
    summary: 'Clear all day',
    data: Array.from({ length: 48 }, (_, i) => ({ time: 1_800_000_000 + i * 3600, temperature: 70 + i })),
  },
  daily: {
    summary: 'Rain on Friday',
    data: Array.from({ length: 8 }, (_, i) => ({ time: 1_800_000_000 + i * 86400, temperatureMax: 80 })),
  },
  alerts: [{ title: 'Heat Advisory', description: 'Hot.', expires: 1_800_010_000 }],
};

function makeServices(overrides: Partial<WeatherServices> = {}): WeatherServices {
  return {
    geocode: vi.fn(async () => ({ latitude: 28.538, longitude: -81.379, address: 'Orlando, FL, USA' })),
    forecast: vi.fn(async () => forecast),
    ...overrides,
  };
}

function get(query: string, { token = TOKEN, method = 'GET', path = '/api/forecast' } = {}) {
  return new Request(`https://weatherman.example${path}${query}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const silent = { error: vi.fn() };

describe('tokensMatch', () => {
  it('matches only identical strings', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abd', 'abc')).toBe(false);
    expect(tokensMatch('ab', 'abc')).toBe(false);
    expect(tokensMatch('abcd', 'abc')).toBe(false);
    expect(tokensMatch('', 'abc')).toBe(false);
  });
});

describe('handleApiRequest', () => {
  it('returns current conditions for the default location', async () => {
    const services = makeServices();
    const res = await handleApiRequest(get(''), config, services, silent);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      location: { label: 'at HQ', latitude: 1, longitude: 2, isDefault: true },
      type: 'currently',
      units: 'us',
      timezone: 'America/New_York',
      currently: { temperature: 75.4 },
      alerts: [{ title: 'Heat Advisory' }],
    });
    expect(services.geocode).not.toHaveBeenCalled();
    expect(services.forecast).toHaveBeenCalledWith(1, 2, 'currently');
  });

  it('geocodes a place and trims hourly and daily data', async () => {
    const services = makeServices();
    const hourly = await (await handleApiRequest(get('?place=orlando&type=hourly'), config, services, silent)).json() as ForecastResponse;
    expect(hourly.location).toEqual({ label: 'Orlando, FL, USA', latitude: 28.538, longitude: -81.379, isDefault: false });
    expect(hourly.summary).toBe('Clear all day');
    expect(hourly.hourly).toHaveLength(12);
    expect(hourly.currently).toBeUndefined();

    const daily = await (await handleApiRequest(get('?place=orlando&type=daily'), config, services, silent)).json() as ForecastResponse;
    expect(daily.daily).toHaveLength(7);
    expect(services.forecast).toHaveBeenLastCalledWith(28.538, -81.379, 'daily');
  });

  it('is disabled when no token is configured', async () => {
    const { agentApiToken: _, ...noToken } = config;
    const res = await handleApiRequest(get(''), noToken, makeServices(), silent);
    expect(res.status).toBe(404);
  });

  it('rejects missing or wrong tokens', async () => {
    expect((await handleApiRequest(get('', { token: '' }), config, makeServices(), silent)).status).toBe(401);
    expect((await handleApiRequest(get('', { token: 'nope' }), config, makeServices(), silent)).status).toBe(401);
  });

  it('rejects other paths, methods, types and oversized places', async () => {
    const services = makeServices();
    expect((await handleApiRequest(get('', { path: '/api/other' }), config, services, silent)).status).toBe(404);
    expect((await handleApiRequest(get('', { method: 'POST' }), config, services, silent)).status).toBe(405);
    expect((await handleApiRequest(get('?type=minutely'), config, services, silent)).status).toBe(400);
    expect((await handleApiRequest(get(`?place=${'x'.repeat(201)}`), config, services, silent)).status).toBe(400);
    expect(services.forecast).not.toHaveBeenCalled();
  });

  it('reports unknown places and upstream failures', async () => {
    const notFound = makeServices({ geocode: vi.fn(async () => Promise.reject(new LocationNotFoundError('zzz'))) });
    const res = await handleApiRequest(get('?place=zzz'), config, notFound, silent);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'location_not_found', place: 'zzz' });

    const logger = { error: vi.fn() };
    const broken = makeServices({ forecast: vi.fn(async () => Promise.reject(new Error('HTTP 500'))) });
    const res2 = await handleApiRequest(get(''), config, broken, logger);
    expect(res2.status).toBe(502);
    expect(await res2.json()).toEqual({ error: 'upstream_error' });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
