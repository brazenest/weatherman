# Weatherman

**A weather app for Slack.** Type `/weather` in any channel or DM to get current conditions, an hourly outlook, or a seven-day forecast for anywhere in the world.

v2.2.0 · November 12, 2026

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

Weatherman runs as a [Cloudflare Worker](https://developers.cloudflare.com/workers/) at **`https://weatherman.apps.radiantx.solutions`**. Slack sends each `/weather` command to `/slack/events`. The Worker checks Slack's signature, acknowledges immediately, then fetches the forecast and posts it back to Slack in the background.

### Requirements

- A **Cloudflare account** that holds the `radiantx.solutions` zone. The Worker's Custom Domain creates the DNS record and TLS certificate for `weatherman.apps.radiantx.solutions` itself. Remove any existing DNS record for that hostname first.
- A **Slack workspace** where you can install apps
- A **Pirate Weather API key** (free) from [pirateweather.net](https://pirateweather.net), which provides the forecast data
- A **Google Maps Platform API key** with the **Geocoding API** enabled, which turns place names into coordinates
- **Node.js 22.9 or newer** on the machine you deploy from

The Workers Free plan is enough.

### 1. Install

```sh
git clone git@github.com:brazenest/weatherman.git
cd weatherman
npm install
npx wrangler login
```

### 2. Create the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**. Name it *Weatherman* and pick your workspace.
2. Under **Basic Information → App Credentials**, copy the **Signing Secret**. You'll need it in the next step.
3. Under **Slash Commands → Create New Command**:
   - **Command:** `/weather`
   - **Request URL:** `https://weatherman.apps.radiantx.solutions/slack/events`
   - **Short Description:** `Get the weather forecast`
   - **Usage Hint:** `[-hourly | -daily] [place]`
4. Under **Install App**, install it to your workspace.

The slash command needs no other scopes, event subscriptions or bot token.

### 3. Set secrets and deploy

Secrets are stored encrypted in Cloudflare, never in the repo. Each command prompts for the value:

```sh
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put PIRATE_WEATHER_API_KEY
npx wrangler secret put GOOGLE_GEOCODING_API_KEY

npm run deploy
```

Then type `/weather help` in Slack to confirm everything is connected.

To ship a change later, run `npm run deploy` again. Secrets persist between deploys.

### Configuration

**Secrets** (set with `npx wrangler secret put <NAME>`):

| Name | Description |
| --- | --- |
| `SLACK_SIGNING_SECRET` | Verifies that requests really come from Slack. Found under *Basic Information* in your Slack app. |
| `PIRATE_WEATHER_API_KEY` | Pirate Weather API key. |
| `GOOGLE_GEOCODING_API_KEY` | Google Maps Platform key with the Geocoding API enabled. |
| `AGENT_API_TOKEN` | *Optional.* Bearer token for the JSON forecast API (below). The API is off when this isn't set. Generate one with `openssl rand -hex 32`. |

**Settings** (in the `vars` section of `wrangler.jsonc`; redeploy after changing):

| Name | Current value | Description |
| --- | --- | --- |
| `DEFAULT_LATITUDE` | `28.480` | Latitude used when no place is given. |
| `DEFAULT_LONGITUDE` | `-81.455` | Longitude used when no place is given. |
| `DEFAULT_LOCATION_LABEL` | `at Concepta HQ` | Text shown at the top of replies for the default location. |
| `ADMIN_USER_IDS` | `U0VTT5EHL` | Comma-separated Slack user IDs that see debug details on errors. |
| `ADMIN_TEAM_IDS` | `T02996B3M` | Comma-separated Slack workspace (team) IDs. A user sees debug details only if their user **and** workspace IDs are both listed. |

To find a Slack user ID, open the person's profile → **⋮** → **Copy member ID**. The workspace ID is the `T…` value in your workspace's URL at `app.slack.com/client/T…/`.

The domain is set by `routes` in `wrangler.jsonc`.

### JSON forecast API

For programmatic clients, such as a Slack agent that answers weather questions, the Worker also serves:

```
GET /api/forecast?place=<place>&type=currently|hourly|daily
Authorization: Bearer <AGENT_API_TOKEN>
```

`place` is optional and defaults to the configured default location; `type` defaults to `currently`. The response is JSON with the resolved `location`, the location's `timezone`, any active `alerts`, and either `currently`, `hourly` (next 12 hours) or `daily` (next 7 days). Temperatures are °F, wind speeds mph, and times Unix seconds.

| Status | Meaning |
| --- | --- |
| `200` | Forecast returned. |
| `400` | Unknown `type`, or `place` longer than 200 characters. |
| `401` | Missing or wrong bearer token. |
| `404` | `location_not_found`, or the API is disabled because `AGENT_API_TOKEN` isn't set. |
| `502` | `upstream_error`: the geocoding or forecast service failed. `wrangler tail` shows the cause. |

### Logs

Logs are enabled. View them in the Cloudflare dashboard under **Workers & Pages → weatherman → Logs**, or stream them live with:

```sh
npx wrangler tail
```

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Slack says *"dispatch_failed"* or the command times out | Slack can't reach the Worker. Check the Request URL is exactly `https://weatherman.apps.radiantx.solutions/slack/events` and that the deploy succeeded. |
| Deploy fails with a domain or zone error | `radiantx.solutions` isn't in the Cloudflare account you're logged into, or another DNS record already uses `weatherman.apps.radiantx.solutions`. |
| Requests get `401 Invalid signature` | `SLACK_SIGNING_SECRET` doesn't match the Slack app's signing secret. |
| Requests get `500 Server misconfigured` | A required secret isn't set. `wrangler tail` shows which one. |
| `/weather` works but every place returns "Something went wrong" | Google key problem. The admin debug panel will show e.g. `REQUEST_DENIED`. Check the key and that the Geocoding API is enabled. |
| Nothing works, logs show `Weather API request failed: HTTP 401/403` | `PIRATE_WEATHER_API_KEY` is missing or invalid. |

---

## Development

```sh
cp .dev.vars.example .dev.vars   # then fill in the secrets
npm run dev        # run the Worker locally at http://localhost:8787
npm test           # run the test suite (Vitest)
npm run typecheck  # type-check source and tests
npm run types      # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npm run deploy     # deploy to Cloudflare
```

To try the bot from Slack against a local Worker, expose port 8787 with a tunnel (for example `cloudflared tunnel --url http://localhost:8787`) and temporarily point the slash command's Request URL at it.

### Project layout

```
src/
  worker.ts                Worker entry point: loads config, wires up services
  config.ts                reads and validates vars and secrets
  api/
    forecast.ts            JSON forecast API (GET /api/forecast) with bearer-token auth
  slack/
    handler.ts             HTTP handling: routing, ack, background reply, error replies
    verify.ts              Slack request signature verification (Web Crypto)
    weatherCommand.ts      parses command text, formats forecast replies
    message.ts             Slack message and attachment builders
  weather/
    forecast.ts            Pirate Weather API client
    geocoding.ts           Google Geocoding API client
    format.ts              emoji, compass directions, time-zone-aware dates
test/
  api.test.ts
  handler.test.ts
  weather.test.ts
wrangler.jsonc             Worker name, domain, vars, required secrets
worker-configuration.d.ts  generated by `npm run types`
```

Command parsing and reply formatting (`weatherCommand.ts`) and request handling (`handler.ts`) take their dependencies as parameters, so they can be tested without network access or the Workers runtime.

---

## Version history

**2.2.0** (2026-11-12)
- New JSON forecast API (`GET /api/forecast`) for programmatic clients such as the Weatherman Slack agent, protected by the optional `AGENT_API_TOKEN` secret.
- Branch builds now create Workers Previews (`previews` block in `wrangler.jsonc`).

**2.1.0** (2026-11-11)
- Runs on Cloudflare Workers at `weatherman.apps.radiantx.solutions` instead of as a Node.js server.
- Configuration moved to `wrangler.jsonc` (settings) and Wrangler secrets (keys).

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
