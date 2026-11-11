export const APP_VERSION = '2.0.0';
export const APP_VERSION_DATE = '2026-11-11';

export interface Location {
  latitude: number;
  longitude: number;
  /** Phrase shown as the message text, e.g. "at Concepta HQ" or "for Orlando, FL, USA". */
  label: string;
}

export interface Config {
  slackSigningSecret: string;
  /** Optional: the app only replies via response_url, which needs no token. */
  slackBotToken?: string;
  pirateWeatherApiKey: string;
  googleGeocodingApiKey: string;
  adminUserIds: string[];
  adminTeamIds: string[];
  defaultLocation: Location;
  port: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
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

function number(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    slackSigningSecret: required(env, 'SLACK_SIGNING_SECRET'),
    ...(env.SLACK_BOT_TOKEN?.trim() && { slackBotToken: env.SLACK_BOT_TOKEN.trim() }),
    pirateWeatherApiKey: required(env, 'PIRATE_WEATHER_API_KEY'),
    googleGeocodingApiKey: required(env, 'GOOGLE_GEOCODING_API_KEY'),
    adminUserIds: list(env.ADMIN_USER_IDS),
    adminTeamIds: list(env.ADMIN_TEAM_IDS),
    defaultLocation: {
      latitude: number(env, 'DEFAULT_LATITUDE', 28.48),
      longitude: number(env, 'DEFAULT_LONGITUDE', -81.455),
      label: env.DEFAULT_LOCATION_LABEL?.trim() || 'at Concepta HQ',
    },
    port: number(env, 'PORT', 3000),
  };
}
