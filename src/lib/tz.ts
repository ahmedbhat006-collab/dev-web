function offsetMs(tz: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - date.getTime()) / 60000) * 60000;
}

/** "2026-10-18T14:30" in `tz` -> exact UTC instant (handles DST). */
export function zonedToUtc(local: string, tz: string): Date {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = (t || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const o1 = offsetMs(tz, new Date(guess));
  let utc = guess - o1;
  const o2 = offsetMs(tz, new Date(utc));
  if (o2 !== o1) utc = guess - o2;
  return new Date(utc);
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" wall time in `tz`. */
export function utcToZonedLocal(date: Date | string, tz: string) {
  const d = new Date(new Date(date).getTime() + offsetMs(tz, new Date(date)));
  return d.toISOString().slice(0, 16);
}

export function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function fmtInTz(date: Date | string, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short", ...opts }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleString();
  }
}

export const tzAbbr = (tz: string, date = new Date()) => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
};
