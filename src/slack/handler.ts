/** Handles HTTP requests from Slack for the `/weather` slash command. */

import type { Config } from '../config.js';
import { LocationNotFoundError } from '../weather/geocoding.js';
import { attachment, message, type SlackMessage } from './message.js';
import { verifySlackSignature } from './verify.js';
import { runWeatherCommand, type WeatherServices } from './weatherCommand.js';

export const SLACK_PATH = '/slack/events';

/** The fields of a slash command payload that Weatherman uses. */
export interface SlashCommand {
  command: string;
  text: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  response_url: string;
}

/** Lets the response go out now and the forecast follow (Workers' `ctx.waitUntil`). */
export interface BackgroundTasks {
  waitUntil(promise: Promise<unknown>): void;
}

export type Logger = Pick<Console, 'error'>;

export function parseSlashCommand(body: string): SlashCommand {
  const form = new URLSearchParams(body);
  const field = (name: keyof SlashCommand) => form.get(name) ?? '';
  return {
    command: field('command'),
    text: field('text'),
    team_id: field('team_id'),
    team_domain: field('team_domain'),
    channel_id: field('channel_id'),
    channel_name: field('channel_name'),
    user_id: field('user_id'),
    user_name: field('user_name'),
    response_url: field('response_url'),
  };
}

/** Only post replies back to Slack itself. */
function isSlackResponseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'hooks.slack.com';
  } catch {
    return false;
  }
}

/**
 * Builds the reply for a failed command. Admins (configured by team and user
 * ID) also get the error and request details for debugging.
 */
export function errorMessage(error: unknown, command: SlashCommand, config: Config): SlackMessage {
  if (error instanceof LocationNotFoundError) {
    const msg = message(`*Hmm…* :thinking_face: I couldn't find a place called “${error.query}”.`);
    msg.attachments.push(attachment('_Try a city name, address or ZIP code._', undefined, { color: 'warning' }));
    return msg;
  }

  const msg = message('*Oh no!* :hushed: Something went wrong getting the weather.');
  msg.attachments.push(attachment('_Try `/weather help`_', 'Need some help? :persevere:', { color: 'warning' }));

  const isAdmin = config.adminTeamIds.includes(command.team_id) && config.adminUserIds.includes(command.user_id);
  if (isAdmin) {
    const detail = error instanceof Error ? error.message : String(error);
    const contact = config.adminUserIds[0];
    const keys = ['command', 'text', 'team_id', 'team_domain', 'channel_id', 'channel_name', 'user_id', 'user_name'] as const;
    msg.attachments.push(
      attachment('_Here are some of the details..._ :sun_behind_cloud:', 'Debug Info', {
        color: '#183691',
        footer:
          "You're seeing this info because I recognize you as an administrator." +
          (contact ? ` Please notify <@${contact}> if I'm mistaken!` : ''),
        markdownIn: ['fields'],
        fields: [
          { title: 'Error message', value: `\`\`\`${detail}\`\`\``, short: false },
          ...keys.map((key) => ({ title: key, value: command[key], short: true })),
        ],
      }),
    );
  }
  return msg;
}

async function reply(responseUrl: string, body: SlackMessage, fetchFn: typeof fetch): Promise<void> {
  const res = await fetchFn(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Posting to response_url failed: HTTP ${res.status}`);
  }
}

/** Fetches the forecast and posts it (or an error message) to the command's response_url. */
export async function answerCommand(
  command: SlashCommand,
  config: Config,
  services: WeatherServices,
  logger: Logger = console,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  let body: SlackMessage;
  try {
    body = await runWeatherCommand(command.text, services, config.defaultLocation);
  } catch (error) {
    if (!(error instanceof LocationNotFoundError)) {
      logger.error(JSON.stringify({ message: 'weather command failed', error: String(error), text: command.text }));
    }
    body = errorMessage(error, command, config);
  }
  try {
    await reply(command.response_url, body, fetchFn);
  } catch (error) {
    logger.error(JSON.stringify({ message: 'reply to Slack failed', error: String(error) }));
  }
}

export async function handleSlackRequest(
  request: Request,
  config: Config,
  services: WeatherServices,
  tasks: BackgroundTasks,
  logger: Logger = console,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== SLACK_PATH) {
    return new Response('Not found', { status: 404 });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  }

  // Slack payloads are small; cap the body anyway before reading it whole.
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > 64 * 1024) {
    return new Response('Payload too large', { status: 413 });
  }
  const rawBody = await request.text();

  const verified = await verifySlackSignature(
    config.slackSigningSecret,
    rawBody,
    request.headers.get('X-Slack-Request-Timestamp'),
    request.headers.get('X-Slack-Signature'),
  );
  if (!verified) {
    return new Response('Invalid signature', { status: 401 });
  }

  const command = parseSlashCommand(rawBody);
  if (command.command !== '/weather' || !isSlackResponseUrl(command.response_url)) {
    return new Response('Unsupported request', { status: 400 });
  }

  // Acknowledge now (Slack waits only 3 seconds); the forecast follows via response_url.
  tasks.waitUntil(answerCommand(command, config, services, logger));
  return new Response(null, { status: 200 });
}
