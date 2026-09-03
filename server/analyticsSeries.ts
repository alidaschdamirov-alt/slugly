const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyCountRow {
  day: string | Date;
  count: number | string;
}

function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function utcDayStart(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * MySQL only returns dates that have clicks. Charts need the missing calendar
 * days as zeroes so two isolated events are not rendered as a continuous trend.
 */
export function fillDailyClickSeries(
  rows: DailyCountRow[],
  fromTimestamp: number,
  toTimestamp: number,
): Array<{ day: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.day);
    if (!key) continue;
    const count = Number(row.count);
    counts.set(key, Number.isFinite(count) ? count : 0);
  }

  const start = utcDayStart(Math.min(fromTimestamp, toTimestamp));
  const end = utcDayStart(Math.max(fromTimestamp, toTimestamp));
  const result: Array<{ day: string; count: number }> = [];
  for (let timestamp = start; timestamp <= end; timestamp += DAY_MS) {
    const day = new Date(timestamp).toISOString().slice(0, 10);
    result.push({ day, count: counts.get(day) ?? 0 });
  }
  return result;
}
