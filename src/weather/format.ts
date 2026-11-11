/** Display helpers: emoji, compass directions and time-zone-aware dates. */

const ICON_EMOJI: Record<string, string> = {
  'clear-day': ':sunny:',
  'clear-night': ':full_moon:',
  rain: ':rain_cloud:',
  snow: ':snow_cloud:',
  sleet: ':snow_cloud:',
  wind: ':wind_blowing_face:',
  fog: ':fog:',
  cloudy: ':cloud:',
  'partly-cloudy-day': ':partly_sunny:',
  'partly-cloudy-night': ':cloud:',
  hail: ':snow_cloud:',
  thunderstorm: ':thunder_cloud_and_rain:',
  tornado: ':tornado:',
};

export function iconEmoji(icon: string | undefined): string {
  return (icon && ICON_EMOJI[icon]) || ':thermometer:';
}

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/** Converts a bearing in degrees to one of 16 compass points (each spans 22.5°, centred on its heading). */
export function degreesToCompass(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.floor((normalized + 11.25) / 22.5) % 16]!;
}

/** Truncates toward zero, matching how the original app displayed temperatures and speeds. */
export const whole = (n: number | undefined): number => Math.trunc(n ?? 0);

type DateParts = Partial<Record<Intl.DateTimeFormatPartTypes, string>>;

function parts(unixSeconds: number, timeZone: string, options: Intl.DateTimeFormatOptions): DateParts {
  const out: DateParts = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone, ...options }).formatToParts(unixSeconds * 1000)) {
    out[p.type] = p.value;
  }
  return out;
}

/** "3:05pm" */
export function formatTime(unixSeconds: number, timeZone: string): string {
  const p = parts(unixSeconds, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.hour}:${p.minute}${p.dayPeriod?.toLowerCase()}`;
}

/** "3pm" */
export function formatHour(unixSeconds: number, timeZone: string): string {
  const p = parts(unixSeconds, timeZone, { hour: 'numeric', hour12: true });
  return `${p.hour}${p.dayPeriod?.toLowerCase()}`;
}

/** "EST" */
export function formatTimeZoneName(unixSeconds: number, timeZone: string): string {
  return parts(unixSeconds, timeZone, { timeZoneName: 'short' }).timeZoneName ?? timeZone;
}

/** "Wednesday" */
export function formatWeekday(unixSeconds: number, timeZone: string): string {
  return parts(unixSeconds, timeZone, { weekday: 'long' }).weekday ?? '';
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** "Dec 26th" */
export function formatMonthDay(unixSeconds: number, timeZone: string): string {
  const p = parts(unixSeconds, timeZone, { month: 'short', day: 'numeric' });
  return `${p.month} ${ordinal(Number(p.day))}`;
}

/**
 * Spaces placed after each weekday name so the emoji column roughly lines up
 * in Slack's proportional font (carried over from the original app).
 */
const WEEKDAY_PADDING: Record<string, number> = {
  Monday: 12,
  Tuesday: 12,
  Wednesday: 6,
  Thursday: 10,
  Friday: 15,
  Saturday: 11,
  Sunday: 13,
};

export function weekdayPadding(weekday: string): string {
  return ' '.repeat(WEEKDAY_PADDING[weekday] ?? 1);
}
