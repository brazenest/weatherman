/** Cloudflare Worker entry point for Weatherman. */

import { handleApiRequest } from './api/forecast.js';
import { loadConfig } from './config.js';
import { handleSlackRequest } from './slack/handler.js';
import type { WeatherServices } from './slack/weatherCommand.js';
import { ForecastClient } from './weather/forecast.js';
import { GeocodingClient } from './weather/geocoding.js';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    let config;
    try {
      config = loadConfig(env);
    } catch (error) {
      console.error(JSON.stringify({ message: 'invalid configuration', error: String(error) }));
      return new Response('Server misconfigured', { status: 500 });
    }

    const geocoder = new GeocodingClient(config.googleGeocodingApiKey);
    const forecaster = new ForecastClient(config.pirateWeatherApiKey);
    const services: WeatherServices = {
      geocode: (query) => geocoder.locate(query),
      forecast: (lat, lng, type) => forecaster.get(lat, lng, type),
    };

    if (new URL(request.url).pathname.startsWith('/api/')) {
      return handleApiRequest(request, config, services);
    }
    return handleSlackRequest(request, config, services, ctx);
  },
} satisfies ExportedHandler<Env>;
