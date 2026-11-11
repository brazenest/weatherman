import { describe, expect, it, vi } from 'vitest';

import { formatForecast, parseArgs, runWeatherCommand, type WeatherServices } from '../src/slack/weatherCommand.js';
import { ForecastClient } from '../src/weather/forecast.js';
import {
  degreesToCompass,
  formatHour,
  formatMonthDay,
  formatTime,
  formatTimeZoneName,
  formatWeekday,
  iconEmoji,
} from '../src/weather/format.js';
import { GeocodingClient, LocationNotFoundError } from '../src/weather/geocoding.js';

const TZ = 'America/New_York';
// 2016-12-26 15:05:00 EST
const T = Date.UTC(2016, 11, 26, 20, 5) / 1000;

describe('parseArgs', () => {
  it.each([
    ['', { kind: 'forecast', forecastType: 'currently' }],
    ['  Orlando, FL ', { kind: 'forecast', forecastType: 'currently', place: 'Orlando, FL' }],
    ['-hourly', { kind: 'forecast', forecastType: 'hourly' }],
    ['-daily sao paulo', { kind: 'forecast', forecastType: 'daily', place: 'sao paulo' }],
    ['-bogus 32801', { kind: 'forecast', forecastType: 'currently', place: '32801' }],
    ['-?', { kind: 'about' }],
    ['help', { kind: 'about' }],
  ])('%j', (input, expected) => {
    expect(parseArgs(input)).toEqual(expected);
  });
});

describe('format helpers', () => {
  it('converts bearings to compass points', () => {
    expect(degreesToCompass(0)).toBe('N');
    expect(degreesToCompass(11.24)).toBe('N');
    expect(degreesToCompass(11.25)).toBe('NNE');
    expect(degreesToCompass(90)).toBe('E');
    expect(degreesToCompass(225)).toBe('SW');
    expect(degreesToCompass(348.75)).toBe('N');
    expect(degreesToCompass(348.7)).toBe('NNW');
    expect(degreesToCompass(360)).toBe('N');
  });

  it('formats times in the forecast time zone', () => {
    expect(formatTime(T, TZ)).toBe('3:05pm');
    expect(formatHour(T, TZ)).toBe('3pm');
    expect(formatTimeZoneName(T, TZ)).toBe('EST');
    expect(formatWeekday(T, TZ)).toBe('Monday');
    expect(formatMonthDay(T, TZ)).toBe('Dec 26th');
    expect(formatMonthDay(T - 4 * 86400, TZ)).toBe('Dec 22nd');
    expect(formatMonthDay(T - 15 * 86400, TZ)).toBe('Dec 11th');
  });

  it('falls back for unknown icons', () => {
    expect(iconEmoji('clear-day')).toBe(':sunny:');
    expect(iconEmoji('something-new')).toBe(':thermometer:');
  });
});

describe('formatForecast', () => {
  it('renders current conditions with alerts', () => {
    const msg = formatForecast(
      {
        latitude: 28.48,
        longitude: -81.455,
        timezone: TZ,
        currently: { time: T, icon: 'clear-day', temperature: 72.9, summary: 'Clear', windSpeed: 5.6, windBearing: 200 },
        alerts: [{ title: 'Frost Advisory', description: 'Brr.', expires: T }],
      },
      'currently',
      'at Concepta HQ',
    );
    expect(msg.text).toBe('at Concepta HQ');
    expect(msg.response_type).toBe('ephemeral');
    expect(msg.attachments).toHaveLength(2);
    expect(msg.attachments[0]).toMatchObject({
      title: ':heavy_exclamation_mark: Frost Advisory',
      color: 'warning',
      footer: 'until 3:05pm on Dec 26th',
    });
    expect(msg.attachments[1]).toMatchObject({
      title: 'Current Conditions',
      text: ':sunny:  *72°* Clear\n winds 5 mph from SSW',
      footer: 'at 3:05pm local time (EST)',
    });
  });

  it('renders five hours of the hourly forecast', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ time: T + i * 3600, icon: 'rain', temperature: 60 + i, summary: 'Rain' }));
    const msg = formatForecast({ latitude: 0, longitude: 0, timezone: TZ, hourly: { summary: 'Wet.', icon: 'rain', data } }, 'hourly', 'x');
    const lines = msg.attachments[1]!.text.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('*3pm*\t:rain_cloud:\t60°\tRain');
    expect(msg.attachments[1]!.footer).toBe('in local time (EST)');
  });

  it('renders seven days of the daily forecast', () => {
    const data = Array.from({ length: 8 }, (_, i) => ({ time: T + i * 86400, icon: 'cloudy', temperatureMax: 70.5, temperatureMin: 50.2, summary: 'Cloudy' }));
    const msg = formatForecast({ latitude: 0, longitude: 0, timezone: TZ, daily: { summary: 'Meh.', data } }, 'daily', 'x');
    const lines = msg.attachments[1]!.text.split('\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe(`*Monday* ${' '.repeat(12)}:cloud:\t70° / 50°\tCloudy`);
  });
});

describe('runWeatherCommand', () => {
  const forecast = { latitude: 0, longitude: 0, timezone: TZ, currently: { time: T, icon: 'fog', temperature: 50 } };

  it('geocodes the place and labels the response with the address', async () => {
    const services: WeatherServices = {
      geocode: vi.fn().mockResolvedValue({ latitude: 1, longitude: 2, address: 'Orlando, FL, USA' }),
      forecast: vi.fn().mockResolvedValue(forecast),
    };
    const msg = await runWeatherCommand('orlando', services, { latitude: 9, longitude: 9, label: 'home' });
    expect(services.forecast).toHaveBeenCalledWith(1, 2, 'currently');
    expect(msg.text).toBe('for Orlando, FL, USA');
  });

  it('uses the default location when no place is given', async () => {
    const services: WeatherServices = { geocode: vi.fn(), forecast: vi.fn().mockResolvedValue(forecast) };
    const msg = await runWeatherCommand('', services, { latitude: 9, longitude: 8, label: 'home' });
    expect(services.geocode).not.toHaveBeenCalled();
    expect(services.forecast).toHaveBeenCalledWith(9, 8, 'currently');
    expect(msg.text).toBe('home');
  });
});

describe('API clients', () => {
  it('builds a Pirate Weather URL that keeps only the requested block and alerts', () => {
    const url = new URL(new ForecastClient('KEY').buildUrl(28.48, -81.455, 'hourly'));
    expect(url.origin + url.pathname).toBe('https://api.pirateweather.net/forecast/KEY/28.48,-81.455');
    expect(url.searchParams.get('exclude')).toBe('currently,minutely,daily,flags');
    expect(url.searchParams.get('units')).toBe('us');
  });

  it('geocodes and rounds coordinates', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      Response.json({
        status: 'OK',
        results: [{ formatted_address: 'Orlando, FL, USA', geometry: { location: { lat: 28.538336, lng: -81.379234 } } }],
      }),
    );
    const result = await new GeocodingClient('KEY', fetchFn).locate('orlando');
    expect(result).toEqual({ latitude: 28.538, longitude: -81.379, address: 'Orlando, FL, USA' });
    expect(String(fetchFn.mock.calls[0]![0])).toContain('address=orlando');
  });

  it('reports unknown places', async () => {
    const fetchFn = vi.fn().mockResolvedValue(Response.json({ status: 'ZERO_RESULTS', results: [] }));
    await expect(new GeocodingClient('KEY', fetchFn).locate('nowhere')).rejects.toBeInstanceOf(LocationNotFoundError);
  });

  it('surfaces geocoding API errors instead of "not found"', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      Response.json({ status: 'REQUEST_DENIED', error_message: 'bad key', results: [] }),
    );
    await expect(new GeocodingClient('KEY', fetchFn).locate('orlando')).rejects.toThrow('REQUEST_DENIED (bad key)');
  });
});
