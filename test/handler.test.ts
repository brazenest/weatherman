import { describe, expect, it, vi } from 'vitest';

import type { Config } from '../src/config.js';
import { answerCommand, handleSlackRequest, parseSlashCommand, type SlashCommand } from '../src/slack/handler.js';
import { verifySlackSignature } from '../src/slack/verify.js';
import type { WeatherServices } from '../src/slack/weatherCommand.js';
import { LocationNotFoundError } from '../src/weather/geocoding.js';

const SECRET = 'test-signing-secret';
const NOW = 1_800_000_000;

async function sign(body: string, timestamp: number, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
  return 'v0=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const config: Config = {
  slackSigningSecret: SECRET,
  pirateWeatherApiKey: 'k',
  googleGeocodingApiKey: 'k',
  adminUserIds: ['UADMIN'],
  adminTeamIds: ['TADMIN'],
  defaultLocation: { latitude: 1, longitude: 2, label: 'home' },
};

const command: SlashCommand = {
  command: '/weather',
  text: 'orlando',
  team_id: 'T1',
  team_domain: 'example',
  channel_id: 'C1',
  channel_name: 'general',
  user_id: 'U1',
  user_name: 'someone',
  response_url: 'https://hooks.slack.com/commands/T1/1/abc',
};

const formBody = (overrides: Partial<SlashCommand> = {}) => new URLSearchParams({ ...command, ...overrides }).toString();

describe('verifySlackSignature', () => {
  it('accepts a correctly signed, recent request', async () => {
    const body = 'a=1';
    const ts = String(NOW - 10);
    expect(await verifySlackSignature(SECRET, body, ts, await sign(body, NOW - 10), NOW)).toBe(true);
  });

  it('rejects a wrong secret, tampered body, stale timestamp or malformed header', async () => {
    const body = 'a=1';
    const ts = String(NOW);
    expect(await verifySlackSignature(SECRET, body, ts, await sign(body, NOW, 'other'), NOW)).toBe(false);
    expect(await verifySlackSignature(SECRET, 'a=2', ts, await sign(body, NOW), NOW)).toBe(false);
    expect(await verifySlackSignature(SECRET, body, String(NOW - 301), await sign(body, NOW - 301), NOW)).toBe(false);
    expect(await verifySlackSignature(SECRET, body, ts, 'v0=zz', NOW)).toBe(false);
    expect(await verifySlackSignature(SECRET, body, null, await sign(body, NOW), NOW)).toBe(false);
  });
});

describe('handleSlackRequest', () => {
  const services: WeatherServices = { geocode: vi.fn(), forecast: vi.fn() };

  async function post(body: string, path = '/slack/events', signature?: string) {
    const ts = Math.floor(Date.now() / 1000);
    const tasks = { waitUntil: vi.fn() };
    const res = await handleSlackRequest(
      new Request(`https://weatherman.example${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Slack-Request-Timestamp': String(ts),
          'X-Slack-Signature': signature ?? (await sign(body, ts)),
        },
        body,
      }),
      config,
      services,
      tasks,
    );
    return { res, tasks };
  }

  it('acknowledges a valid command and answers in the background', async () => {
    const { res, tasks } = await post(formBody());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(tasks.waitUntil).toHaveBeenCalledOnce();
  });

  it('rejects bad signatures', async () => {
    const { res, tasks } = await post(formBody(), '/slack/events', 'v0=00');
    expect(res.status).toBe(401);
    expect(tasks.waitUntil).not.toHaveBeenCalled();
  });

  it('rejects other paths, methods, commands and reply URLs', async () => {
    expect((await post(formBody(), '/other')).res.status).toBe(404);
    expect((await post(formBody({ command: '/other' }))).res.status).toBe(400);
    expect((await post(formBody({ response_url: 'https://evil.example/x' }))).res.status).toBe(400);
    const get = await handleSlackRequest(new Request('https://weatherman.example/slack/events'), config, services, { waitUntil: vi.fn() });
    expect(get.status).toBe(405);
  });
});

describe('answerCommand', () => {
  const okFetch = () => vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
  const sentBody = (fetchFn: ReturnType<typeof okFetch>) => JSON.parse(String(fetchFn.mock.calls[0]![1]!.body));

  it('posts the forecast to response_url', async () => {
    const fetchFn = okFetch();
    const services: WeatherServices = {
      geocode: vi.fn().mockResolvedValue({ latitude: 1, longitude: 2, address: 'Orlando, FL, USA' }),
      forecast: vi.fn().mockResolvedValue({ latitude: 1, longitude: 2, timezone: 'UTC', currently: { time: NOW, icon: 'fog', temperature: 50 } }),
    };
    await answerCommand(command, config, services, { error: vi.fn() }, fetchFn);
    expect(fetchFn.mock.calls[0]![0]).toBe(command.response_url);
    expect(sentBody(fetchFn).text).toBe('for Orlando, FL, USA');
  });

  it('replies with "not found" for unknown places', async () => {
    const fetchFn = okFetch();
    const services: WeatherServices = { geocode: vi.fn().mockRejectedValue(new LocationNotFoundError('xyzzy')), forecast: vi.fn() };
    await answerCommand(command, config, services, { error: vi.fn() }, fetchFn);
    expect(sentBody(fetchFn).text).toContain('couldn\'t find a place called “xyzzy”');
  });

  it('shows debug info only to admins', async () => {
    const services: WeatherServices = { geocode: vi.fn().mockRejectedValue(new Error('boom')), forecast: vi.fn() };
    const logger = { error: vi.fn() };

    const userFetch = okFetch();
    await answerCommand(command, config, services, logger, userFetch);
    expect(sentBody(userFetch).attachments).toHaveLength(1);

    const adminFetch = okFetch();
    await answerCommand({ ...command, user_id: 'UADMIN', team_id: 'TADMIN' }, config, services, logger, adminFetch);
    const debug = sentBody(adminFetch).attachments[1];
    expect(debug.title).toBe('Debug Info');
    expect(debug.fields[0].value).toContain('boom');
    expect(logger.error).toHaveBeenCalled();
  });

  it('parses slash command form bodies', () => {
    expect(parseSlashCommand(formBody({ text: '-daily São Paulo' })).text).toBe('-daily São Paulo');
  });
});
