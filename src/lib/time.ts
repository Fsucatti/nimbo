/**
 * Time formatting in the time zone of the place being viewed, not the visitor's.
 * The API returns Unix timestamps (seconds, UTC) and an IANA zone such as "America/Argentina/Buenos_Aires".
 */

export interface Clock {
  timezone: string;
  hour12: boolean;
  /** "14:00" or "2 PM". */
  hour(ts: number): string;
  /** "14:05" or "2:05 PM". */
  time(ts: number): string;
  /** "Fri". */
  weekday(ts: number): string;
  /** "Friday". */
  weekdayLong(ts: number): string;
  /** "Nov 7". */
  dayMonth(ts: number): string;
  /** "Friday, November 7". */
  fullDate(ts: number): string;
  /** "2026-11-07": the calendar date at the place. */
  dateKey(ts: number): string;
  /** Hour of day at the place, 0–23. */
  hourOfDay(ts: number): number;
  /** Minutes east of UTC at that instant (handles daylight saving time). */
  offsetMinutes(ts: number): number;
}

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = timezone + JSON.stringify(options);
  let result = cache.get(key);
  if (!result) {
    result = new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options });
    cache.set(key, result);
  }
  return result;
}

/** Returns a zone the browser understands, falling back to UTC for unknown names. */
export function safeTimezone(timezone: string | undefined): string {
  if (!timezone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

function parts(timezone: string, ts: number): Record<string, string> {
  const result: Record<string, string> = {};
  const list = formatter(timezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts * 1000));
  for (const part of list) result[part.type] = part.value;
  return result;
}

export function offsetMinutes(timezone: string, ts: number): number {
  const p = parts(timezone, ts);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUtc - ts * 1000) / 60000);
}

export function makeClock(timezoneInput: string | undefined, hour12: boolean): Clock {
  const timezone = safeTimezone(timezoneInput);
  const cycle = hour12 ? "h12" : "h23";
  const hourFormat = formatter(timezone, hour12 ? { hour: "numeric", hourCycle: cycle } : { hour: "2-digit", minute: "2-digit", hourCycle: cycle });
  const timeFormat = formatter(timezone, { hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hourCycle: cycle });
  const weekday = formatter(timezone, { weekday: "short" });
  const weekdayLong = formatter(timezone, { weekday: "long" });
  const dayMonth = formatter(timezone, { month: "short", day: "numeric" });
  const fullDate = formatter(timezone, { weekday: "long", month: "long", day: "numeric" });
  const date = (ts: number) => new Date(ts * 1000);
  // Newer ICU versions put a narrow no-break space before AM/PM.
  const tidy = (text: string) => text.replace(/[  ]/g, " ");

  return {
    timezone,
    hour12,
    hour: (ts) => tidy(hourFormat.format(date(ts))),
    time: (ts) => tidy(timeFormat.format(date(ts))),
    weekday: (ts) => weekday.format(date(ts)),
    weekdayLong: (ts) => weekdayLong.format(date(ts)),
    dayMonth: (ts) => dayMonth.format(date(ts)),
    fullDate: (ts) => fullDate.format(date(ts)),
    dateKey: (ts) => {
      const p = parts(timezone, ts);
      return `${p.year}-${p.month}-${p.day}`;
    },
    hourOfDay: (ts) => Number(parts(timezone, ts).hour) % 24,
    offsetMinutes: (ts) => offsetMinutes(timezone, ts),
  };
}

/** "Today", "Tomorrow", "Yesterday" or the weekday name. */
export function relativeDay(clock: Clock, ts: number, nowTs: number, long = false): string {
  const diff = dayDifference(clock.dateKey(ts), clock.dateKey(nowTs));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return long ? clock.weekdayLong(ts) : clock.weekday(ts);
}

/** Whole days between two "YYYY-MM-DD" keys (a − b). */
export function dayDifference(a: string, b: string): number {
  const toUtc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
}

/** Adds days to a "YYYY-MM-DD" key. Handles month and leap-year boundaries. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** "3 min ago", "just now". */
export function ago(fromMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - fromMs) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
