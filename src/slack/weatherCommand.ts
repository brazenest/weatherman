/** The `/weather` slash command: argument parsing and response formatting. */

import { APP_VERSION, APP_VERSION_DATE, type Location } from '../config.js';
import type { Forecast, ForecastType } from '../weather/forecast.js';
import {
  degreesToCompass,
  formatHour,
  formatMonthDay,
  formatTime,
  formatTimeZoneName,
  formatWeekday,
  iconEmoji,
  weekdayPadding,
  whole,
} from '../weather/format.js';
import type { GeocodeResult } from '../weather/geocoding.js';
import { attachment, message, type SlackMessage } from './message.js';

export interface WeatherServices {
  geocode(query: string): Promise<GeocodeResult>;
  forecast(latitude: number, longitude: number, type: ForecastType): Promise<Forecast>;
}

export type ParsedArgs =
  | { kind: 'about' }
  | { kind: 'forecast'; forecastType: ForecastType; place?: string };

/**
 * Parses the command text. Supported forms:
 *   /weather                    current conditions at the default location
 *   /weather <place>            current conditions for a place
 *   /weather -hourly [place]    next few hours
 *   /weather -daily [place]     next seven days
 *   /weather -? | help          about this app
 * Unrecognised switches are ignored, as in the original app.
 */
export function parseArgs(text: string | undefined): ParsedArgs {
  let rest = (text ?? '').trim();
  let forecastType: ForecastType = 'currently';

  if (rest.toLowerCase() === 'help') return { kind: 'about' };

  if (rest.startsWith('-')) {
    const space = rest.indexOf(' ');
    const flag = space === -1 ? rest.slice(1) : rest.slice(1, space);
    rest = space === -1 ? '' : rest.slice(space + 1).trim();

    if (flag === '?' || flag === 'help') return { kind: 'about' };
    if (flag === 'hourly' || flag === 'daily') forecastType = flag;
  }

  return rest ? { kind: 'forecast', forecastType, place: rest } : { kind: 'forecast', forecastType };
}

export function aboutMessage(now: Date = new Date()): SlackMessage {
  const msg = message();
  msg.attachments.push(
    attachment(
      `version ${APP_VERSION} (${APP_VERSION_DATE})\n© ${now.getFullYear()} Alden Gillespy\n\n` +
        'Usage: `/weather [-hourly | -daily] [place]`',
      'About Weatherman',
    ),
  );
  return msg;
}

export async function runWeatherCommand(
  text: string | undefined,
  services: WeatherServices,
  defaultLocation: Location,
): Promise<SlackMessage> {
  const args = parseArgs(text);
  if (args.kind === 'about') return aboutMessage();

  let location = defaultLocation;
  if (args.place) {
    const geo = await services.geocode(args.place);
    location = { latitude: geo.latitude, longitude: geo.longitude, label: `for ${geo.address}` };
  }

  const forecast = await services.forecast(location.latitude, location.longitude, args.forecastType);
  return formatForecast(forecast, args.forecastType, location.label);
}

export function formatForecast(forecast: Forecast, type: ForecastType, label: string): SlackMessage {
  const msg = message(label);
  const tz = forecast.timezone;

  switch (type) {
    case 'currently': {
      for (const alert of forecast.alerts ?? []) {
        msg.attachments.push(
          attachment(alert.description, `:heavy_exclamation_mark: ${alert.title}`, {
            color: 'warning',
            footer: `until ${formatTime(alert.expires, tz)} on ${formatMonthDay(alert.expires, tz)}`,
            markdownIn: ['title'],
          }),
        );
      }

      const now = forecast.currently;
      if (!now) throw new Error('Weather API response is missing current conditions');
      const text =
        `${iconEmoji(now.icon)}  *${whole(now.temperature)}°* ${now.summary ?? ''}\n` +
        ` winds ${whole(now.windSpeed)} mph from ${degreesToCompass(now.windBearing ?? 0)}`;
      msg.attachments.push(
        attachment(text, 'Current Conditions', {
          footer: `at ${formatTime(now.time, tz)} local time (${formatTimeZoneName(now.time, tz)})`,
        }),
      );
      break;
    }

    case 'hourly': {
      const block = forecast.hourly;
      if (!block) throw new Error('Weather API response is missing the hourly forecast');
      msg.attachments.push(
        attachment(`${iconEmoji(block.icon)} ${block.summary ?? ''}`, "Today's Hourly Forecast", {
          markdownIn: ['fields'],
        }),
      );
      const lines = block.data
        .slice(0, 5)
        .map(
          (h) =>
            `*${formatHour(h.time, tz)}*\t${iconEmoji(h.icon)}\t${whole(h.temperature)}°\t${h.summary ?? ''}`,
        );
      const first = block.data[0];
      msg.attachments.push(
        attachment(lines.join('\n'), undefined, {
          ...(first && { footer: `in local time (${formatTimeZoneName(first.time, tz)})` }),
        }),
      );
      break;
    }

    case 'daily': {
      const block = forecast.daily;
      if (!block) throw new Error('Weather API response is missing the daily forecast');
      msg.attachments.push(
        attachment(`${iconEmoji(block.icon)} ${block.summary ?? ''}`, "This Week's Forecast", {
          markdownIn: ['fields'],
        }),
      );
      const lines = block.data.slice(0, 7).map((d) => {
        const weekday = formatWeekday(d.time, tz);
        return (
          `*${weekday}* ${weekdayPadding(weekday)}${iconEmoji(d.icon)}\t` +
          `${whole(d.temperatureMax)}° / ${whole(d.temperatureMin)}°\t${d.summary ?? ''}`
        );
      });
      msg.attachments.push(attachment(lines.join('\n')));
      break;
    }
  }

  return msg;
}
