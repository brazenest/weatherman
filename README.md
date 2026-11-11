# Weatherman: A weather app for Slack

v2.0.0 - November 11, 2026

A `/weather` slash command for Slack, written in TypeScript on [Bolt for JavaScript](https://slack.dev/bolt-js).

## Usage

| Command | Result |
| --- | --- |
| `/weather` | Current conditions at the default location |
| `/weather <place>` | Current conditions (plus any active alerts) for a city, address or ZIP code |
| `/weather -hourly [place]` | The next five hours |
| `/weather -daily [place]` | The next seven days |
| `/weather -?` or `/weather help` | Version and usage info |

## Setup

Requires Node.js 20 or newer.

```sh
npm install
cp .env.example .env   # then fill in the values
npm run build
npm start
```

For development, `npm run dev` reloads on changes. `npm test` runs the test suite.

### Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `SLACK_SIGNING_SECRET` | yes | Slack app → Basic Information → Signing Secret |
| `PIRATE_WEATHER_API_KEY` | yes | Free key from [pirateweather.net](https://pirateweather.net) |
| `GOOGLE_GEOCODING_API_KEY` | yes | Google Maps Platform key with the Geocoding API enabled |
| `SLACK_BOT_TOKEN` | no | Not needed: replies go through the command's `response_url` |
| `ADMIN_USER_IDS`, `ADMIN_TEAM_IDS` | no | Comma-separated IDs that get debug details when a command fails |
| `DEFAULT_LATITUDE`, `DEFAULT_LONGITUDE`, `DEFAULT_LOCATION_LABEL` | no | Location used when no place is given |
| `PORT` | no | Default `3000` |

### Slack app settings

Point both of these at `https://<your-host>/slack/events`:

- **Slash Commands** → `/weather` → Request URL
- **Event Subscriptions** → Request URL (if enabled)

## Changes from 1.x (PHP)

- Rewritten in TypeScript.
- Dark Sky shut down in 2023. Weather data now comes from Pirate Weather, a Dark Sky-compatible API.
- Requests are verified with Slack's signing secret instead of the deprecated verification token.
- Secrets are read from environment variables instead of being hardcoded.
- Places that can't be found now get a clear message instead of a broken response.

Copyright 2016–2026 Alden Gillespy. All rights reserved.
