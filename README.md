# Weatherman

**A weather app for Slack.** Type `/weather` in any channel or DM to get current conditions, an hourly outlook, or a seven-day forecast for anywhere in the world.

v2.0.0 · November 11, 2026

---

## Using Weatherman

Weatherman replies only to you (an *ephemeral* message), so checking the weather never clutters a channel. Temperatures are in °F and wind speeds in mph.

### Commands

| Command | What you get |
| --- | --- |
| `/weather` | Current conditions at the default location |
| `/weather <place>` | Current conditions for `<place>`, plus any active weather alerts |
| `/weather -hourly [place]` | A summary of the day and the next 5 hours |
| `/weather -daily [place]` | A summary of the week and the next 7 days, with highs and lows |
| `/weather help` or `/weather -?` | Version info and a usage reminder |

If you leave out `[place]`, Weatherman uses the default location (see [Configuration](#configuration)).

### Places

`<place>` can be anything Google Maps understands:

```
/weather Orlando
/weather 32801
/weather 1600 Pennsylvania Ave, Washington DC
/weather -daily São Paulo
/weather -hourly Tokyo, Japan
```

The reply begins with the full address Google matched (for example, *for Orlando, FL, USA*), so you can confirm it found the right place. If a name is ambiguous, add a state or country.

### What the replies look like

**Current conditions** (`/weather Orlando`)

> for Orlando, FL, USA
> **Current Conditions**
> ☀️ **72°** Clear
> winds 5 mph from SSW
> *at 3:05pm local time (EST)*

Active warnings and advisories for the area appear above the conditions in yellow, each with its expiry time.

**Hourly** (`/weather -hourly Orlando`)

> **Today's Hourly Forecast**
> 🌧 Rain starting this afternoon.
> **3pm** 🌧 68° Light Rain
> **4pm** 🌧 67° Rain
> …
> *in local time (EST)*

**Daily** (`/weather -daily Orlando`)

> **This Week's Forecast**
> ⛅ Light rain on Thursday.
> **Monday** ☀️ 74° / 58° Clear throughout the day.
> **Tuesday** ⛅ 76° / 60° Partly cloudy.
> …

All times are shown in the forecast location's own time zone, not yours.

### When something goes wrong

- **"I couldn't find a place called …"**: Google didn't recognise the place. Try a city name, a full address, or a ZIP/postal code.
- **"Something went wrong getting the weather"**: a weather or geocoding service failed. Try again in a moment. If it keeps happening, tell whoever runs Weatherman in your workspace.

Administrators (see `ADMIN_USER_IDS` below) also see a **Debug Info** panel with the error and the request details.

---

## Running Weatherman

Weatherman is a small Node.js web service. Slack sends each `/weather` command to it over HTTPS, and it replies with the forecast.

### Requirements

- **Node.js 22.9 or newer**
- A **Slack workspace** where you can install apps
- A **Pirate Weather API key** (free) from [pirateweather.net](https://pirateweather.net), which provides the forecast data
- A **Google Maps Platform API key** with the **Geocoding API** enabled, which turns place names into coordinates
- A **public HTTPS URL** that reaches the server. Slack can't call `localhost`. For local development, use a tunnel such as `ngrok` or `cloudflared`.

### 1. Install and configure

```sh
git clone git@github.com:brazenest/weatherman.git
cd weatherman
npm install
cp .env.example .env
```

Fill in `.env` (see [Configuration](#configuration)). Leave `SLACK_SIGNING_SECRET` empty until step 2 gives it to you.

### 2. Create the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**. Name it *Weatherman* and pick your workspace.
2. Under **Basic Information → App Credentials**, copy the **Signing Secret** into `SLACK_SIGNING_SECRET` in `.env`.
3. Under **Slash Commands → Create New Command**:
   - **Command:** `/weather`
   - **Request URL:** `https://<your-host>/slack/events`
   - **Short Description:** `Get the weather forecast`
   - **Usage Hint:** `[-hourly | -daily] [place]`
4. Under **Install App**, install it to your workspace.

The slash command needs no other scopes, event subscriptions or bot token.

### 3. Build and start

```sh
npm run build
npm start
```

You should see:

```
Weatherman v2.0.0 listening on port 3000 (POST /slack/events)
```

Then type `/weather help` in Slack to confirm everything is connected.

In production, run `npm start` under a process manager (systemd, pm2, a container platform, etc.) behind HTTPS. Environment variables can come from `.env` or be set directly. Values already set in the environment take precedence over `.env`.

### Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SLACK_SIGNING_SECRET` | **yes** | | Verifies that requests really come from Slack. Found under *Basic Information* in your Slack app. |
| `PIRATE_WEATHER_API_KEY` | **yes** | | Pirate Weather API key. |
| `GOOGLE_GEOCODING_API_KEY` | **yes** | | Google Maps Platform key with the Geocoding API enabled. |
| `DEFAULT_LATITUDE` | no | `28.480` | Latitude used when no place is given. |
| `DEFAULT_LONGITUDE` | no | `-81.455` | Longitude used when no place is given. |
| `DEFAULT_LOCATION_LABEL` | no | `at Concepta HQ` | Text shown at the top of replies for the default location. |
| `ADMIN_USER_IDS` | no | *(none)* | Comma-separated Slack user IDs that see debug details on errors. |
| `ADMIN_TEAM_IDS` | no | *(none)* | Comma-separated Slack workspace (team) IDs. A user sees debug details only if their user **and** workspace IDs are both listed. |
| `PORT` | no | `3000` | Port the server listens on. |
| `SLACK_BOT_TOKEN` | no | | Not needed. Replies use the command's response URL. |

To find a Slack user ID, open the person's profile → **⋮** → **Copy member ID**. The workspace ID is the `T…` value in your workspace's URL at `app.slack.com/client/T…/`.

The server exits at startup with a message naming any required variable that is missing.

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Slack says *"dispatch_failed"* or the command times out | Slack can't reach the server. Check the Request URL ends in `/slack/events`, that it's HTTPS, and that the server is running. |
| Server logs *"signature mismatch"* | `SLACK_SIGNING_SECRET` doesn't match the Slack app's signing secret. |
| `/weather` works but every place returns "Something went wrong" | Google key problem. The admin debug panel will show e.g. `REQUEST_DENIED`. Check the key and that the Geocoding API is enabled. |
| Nothing works, logs show `Weather API request failed: HTTP 401/403` | `PIRATE_WEATHER_API_KEY` is missing or invalid. |

---

## Development

```sh
npm run dev        # run from source, restarting on changes (reads .env)
npm test           # run the test suite (Vitest)
npm run typecheck  # type-check source and tests
npm run build      # compile to dist/
```

### Project layout

```
src/
  index.ts                 entry point: loads config, starts the server
  app.ts                   Slack app: registers /weather, builds error replies
  config.ts                reads and validates environment variables
  slack/
    weatherCommand.ts      parses command text, formats forecast replies
    message.ts             Slack message and attachment builders
  weather/
    forecast.ts            Pirate Weather API client
    geocoding.ts           Google Geocoding API client
    format.ts              emoji, compass directions, time-zone-aware dates
test/
  weather.test.ts
```

Command parsing and reply formatting (`weatherCommand.ts`) are pure functions that take the weather services as parameters, so they can be tested without network access.

---

## Version history

**2.0.0** (2026-11-11)
- Rewritten in TypeScript on Slack's [Bolt](https://slack.dev/bolt-js) framework.
- Weather data now comes from Pirate Weather, a Dark Sky-compatible API (Dark Sky shut down in 2023).
- Requests are verified with Slack's signing secret instead of the deprecated verification token.
- Credentials and settings moved from source code into environment variables.
- Added `/weather help`, a clear reply for unknown places, and emoji for thunderstorms, hail and tornadoes.

**1.3.0** (2016-12-26)
- Last PHP release.

---

Copyright 2016–2026 Alden Gillespy. All rights reserved.
