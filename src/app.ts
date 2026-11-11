import bolt from '@slack/bolt';
import type { SlashCommand } from '@slack/bolt';

import type { Config } from './config.js';
import { attachment, message, type SlackMessage } from './slack/message.js';
import { runWeatherCommand, type WeatherServices } from './slack/weatherCommand.js';
import { ForecastClient } from './weather/forecast.js';
import { GeocodingClient, LocationNotFoundError } from './weather/geocoding.js';

const { App, LogLevel } = bolt;

export function createServices(config: Config): WeatherServices {
  const geocoder = new GeocodingClient(config.googleGeocodingApiKey);
  const forecaster = new ForecastClient(config.pirateWeatherApiKey);
  return {
    geocode: (query) => geocoder.locate(query),
    forecast: (lat, lng, type) => forecaster.get(lat, lng, type),
  };
}

/**
 * Builds the reply for a failed command. Admins (configured by team and user
 * ID) also get the error and request details for debugging.
 */
export function errorMessage(error: unknown, command: SlashCommand, config: Config): SlackMessage {
  if (error instanceof LocationNotFoundError) {
    const msg = message(`*Hmm…* :thinking_face: I couldn't find a place called “${error.query}”.`);
    msg.attachments.push(
      attachment('_Try a city name, address or ZIP code._', undefined, { color: 'warning' }),
    );
    return msg;
  }

  const msg = message("*Oh no!* :hushed: Something went wrong getting the weather.");
  msg.attachments.push(
    attachment('_Try `/weather help`_', 'Need some help? :persevere:', { color: 'warning' }),
  );

  const isAdmin =
    config.adminTeamIds.includes(command.team_id) && config.adminUserIds.includes(command.user_id);
  if (isAdmin) {
    const detail = error instanceof Error ? error.message : String(error);
    const contact = config.adminUserIds[0];
    msg.attachments.push(
      attachment('_Here are some of the details..._ :sun_behind_cloud:', 'Debug Info', {
        color: '#183691',
        footer:
          "You're seeing this info because I recognize you as an administrator." +
          (contact ? ` Please notify <@${contact}> if I'm mistaken!` : ''),
        markdownIn: ['fields'],
        fields: [
          { title: 'Error message', value: `\`\`\`${detail}\`\`\``, short: false },
          ...(['command', 'text', 'team_id', 'team_domain', 'channel_id', 'channel_name', 'user_id', 'user_name'] as const).map(
            (key) => ({ title: key, value: String(command[key] ?? ''), short: true }),
          ),
        ],
      }),
    );
  }
  return msg;
}

export function createApp(config: Config, services: WeatherServices = createServices(config)) {
  const app = new App({
    signingSecret: config.slackSigningSecret,
    ...(config.slackBotToken
      ? { token: config.slackBotToken }
      : { authorize: async () => ({}) }),
    logLevel: LogLevel.INFO,
  });

  app.command('/weather', async ({ command, ack, respond, logger }) => {
    // Acknowledge right away: Slack only waits 3 seconds, and the two API calls can take longer.
    await ack();
    try {
      await respond(await runWeatherCommand(command.text, services, config.defaultLocation));
    } catch (error) {
      if (!(error instanceof LocationNotFoundError)) logger.error(error);
      await respond(errorMessage(error, command, config));
    }
  });

  return app;
}
