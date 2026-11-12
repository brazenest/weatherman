export const APP_VERSION = '2.1.0';
export const APP_VERSION_DATE = '2026-11-11';

export interface Location {
  latitude: number;
  longitude: number;
  /** Phrase shown as the message text, e.g. "at Concepta HQ" or "for Orlando, FL, USA". */
  label: string;
}

export interface Config {
  slackSigningSecret: string;
  pirateWeatherApiKey: string;
  googleGeocodingApiKey: string;
  /** Bearer token for the JSON API (/api/forecast). The API is disabled when unset. */
  agentApiToken?: string;
  adminUserIds: string[];
  adminTeamIds: string[];
  defaultLocation: Location;
}

/** The settings Weatherman reads: Worker vars and secrets (see wrangler.jsonc). */
export interface ConfigEnv {
  SLACK_SIGNING_SECRET?: string;
  PIRATE_WEATHER_API_KEY?: string;
  GOOGLE_GEOCODING_API_KEY?: string;
  AGENT_API_TOKEN?: string;
  ADMIN_USER_IDS?: string;
  ADMIN_TEAM_IDS?: string;
  DEFAULT_LATITUDE?: string;
  DEFAULT_LONGITUDE?: string;
  DEFAULT_LOCATION_LABEL?: string;
}

type EnvKey = keyof ConfigEnv;

function required(env: ConfigEnv, name: EnvKey): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function number(env: ConfigEnv, name: EnvKey, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

export function loadConfig(env: ConfigEnv): Config {
  return {
    slackSigningSecret: required(env, 'SLACK_SIGNING_SECRET'),
    pirateWeatherApiKey: required(env, 'PIRATE_WEATHER_API_KEY'),
    googleGeocodingApiKey: required(env, 'GOOGLE_GEOCODING_API_KEY'),
    ...(env.AGENT_API_TOKEN?.trim() && { agentApiToken: env.AGENT_API_TOKEN.trim() }),
    adminUserIds: list(env.ADMIN_USER_IDS),
    adminTeamIds: list(env.ADMIN_TEAM_IDS),
    defaultLocation: {
      latitude: number(env, 'DEFAULT_LATITUDE', 28.48),
      longitude: number(env, 'DEFAULT_LONGITUDE', -81.455),
      label: env.DEFAULT_LOCATION_LABEL?.trim() || 'at Concepta HQ',
    },
  };
}
