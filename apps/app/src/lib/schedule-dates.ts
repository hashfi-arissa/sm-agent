// Schedule dates are local `YYYY-MM-DD` + optional `HH:mm` (never UTC timestamps).

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of `d` as `YYYY-MM-DD`. */
export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time of `d` as `HH:mm`. */
export function toLocalTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Splits a calendar position into the stored date + time (null time = all-day). */
export function toSchedule(
  start: Date,
  allDay: boolean,
): { date: string; time: string | null } {
  return { date: toLocalDate(start), time: allDay ? null : toLocalTime(start) };
}

/** "Mon, Oct 5, 2026 · 09:30" — or without the time for all-day entries. */
export function formatSchedule(date: string, time: string | null): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return time ? `${day} · ${time}` : day;
}
