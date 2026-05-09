// Pure date / grid helpers for the monthly calendar view.
//
// Kept dependency-free so the math is testable in isolation and the
// component file stays focused on rendering. Two design constraints
// drive the choices here:
//
//  1. Italian week starts on Monday. Built-in `getDay()` returns
//     Sunday=0…Saturday=6, so we remap.
//  2. Date matching is done on local-date components (Y/M/D), not on
//     `Date` references or `toLocaleDateString` output. The latter is
//     locale-dependent and would break grouping when a non-it locale
//     is the system default.

import type { DatabaseRow } from '../../../../shared/ipc';

/**
 * One cell of the rendered grid. `notes` are pre-bucketed at build
 * time so DayCell stays a dumb renderer.
 */
export type DayCell = {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  notes: DatabaseRow[];
};

/** Italian-locale month/year title formatter. Module-scoped. */
const MONTH_TITLE_FORMATTER = new Intl.DateTimeFormat('it', {
  month: 'long',
  year: 'numeric',
});

/** Strict ISO-date check: YYYY-MM-DD plus actual calendar validity. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a candidate ISO-date string. Returns the same string if
 * valid, `null` otherwise. Calendar validity matters here: the regex
 * alone would accept "2026-02-30", and `new Date('2026-02-30')` would
 * silently roll over to March, which would then end up bucketed in
 * the wrong month.
 */
export function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!ISO_DATE_RE.test(value)) return null;
  // Use UTC midnight for the validity check so DST jumps don't
  // corrupt the round-trip. The +T00:00:00Z suffix forces UTC parse;
  // the `slice(0, 10)` round-trips back to the same string when the
  // calendar accepts the date.
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== value) return null;
  return value;
}

/**
 * Italian month/year title (e.g. "maggio 2026"). The formatter
 * lowercases the month name; capitalize the first letter so headers
 * read as proper titles.
 */
export function formatMonthTitle(year: number, month: number): string {
  // `Date(year, month, 1)` constructs in the local timezone; that's
  // what we want here because the user is reading a calendar header,
  // not doing date arithmetic.
  const d = new Date(year, month, 1);
  const raw = MONTH_TITLE_FORMATTER.format(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Local-date "YYYY-MM-DD" key for grouping rows by day. */
function localIsoKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Map "Sunday=0…Saturday=6" → "Monday=0…Sunday=6". The grid is
 * rendered Monday-first per the Italian locale convention.
 */
function mondayFirstWeekday(d: Date): number {
  const sundayFirst = d.getDay(); // 0..6
  return (sundayFirst + 6) % 7; // shift Sun=0 to 6, Mon=1 to 0, etc.
}

/**
 * Build the 35- or 42-cell grid for the given month. The grid always
 * starts on a Monday and ends on a Sunday so the row count stays
 * consistent regardless of where the first/last day of the month
 * falls.
 *
 * `rows` are bucketed into the cell whose local-date matches the
 * `groupBy`-keyed property's value. Rows whose value isn't a valid
 * ISO date are simply not bucketed (silently dropped from the
 * calendar — they still appear in other views).
 */
export function buildMonthGrid(
  year: number,
  month: number,
  rows: DatabaseRow[],
  groupBy: string,
): DayCell[] {
  // Pre-bucket rows by ISO key so cell construction stays O(rows + cells)
  // instead of O(rows × cells). We use string keys so two rows on the
  // same day end up in the same bucket regardless of timezone quirks.
  const buckets = new Map<string, DatabaseRow[]>();
  for (const row of rows) {
    const prop = row.properties[groupBy];
    if (prop === undefined) continue;
    if (prop.type !== 'date') continue;
    const iso = normalizeIsoDate(prop.value);
    if (iso === null) continue;
    const existing = buckets.get(iso);
    if (existing === undefined) {
      buckets.set(iso, [row]);
    } else {
      existing.push(row);
    }
  }

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = mondayFirstWeekday(firstOfMonth);

  // Grid origin = the Monday on or before the first of the month.
  // Use `setDate` with a negative offset so month/year underflow is
  // handled by the Date constructor itself.
  const gridStart = new Date(year, month, 1 - startOffset);

  // Decide between 35 (5 rows) and 42 (6 rows) cells. We need 6 rows
  // when the month either starts late in the week or has 31 days
  // pushing past day 35. Rather than hand-roll the logic, compute
  // the smallest multiple of 7 that covers the last day of the month.
  const lastOfMonth = new Date(year, month + 1, 0); // day 0 of next month = last day
  const totalDays = startOffset + lastOfMonth.getDate();
  const cellCount = totalDays > 35 ? 42 : 35;

  // Today snapshot — captured once so re-render of the same month
  // doesn't repeatedly construct a Date and so all cells agree on
  // "today" in the same render.
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const cells: DayCell[] = [];
  for (let i = 0; i < cellCount; i++) {
    // Adding `i` to the start day via the Date constructor avoids
    // DST-jump bugs that `setDate(d.getDate() + 1)` introduces in
    // edge cases.
    const cellDate = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i,
    );
    const cellY = cellDate.getFullYear();
    const cellM = cellDate.getMonth();
    const cellD = cellDate.getDate();

    cells.push({
      date: cellDate,
      isCurrentMonth: cellM === month && cellY === year,
      isToday: cellY === todayY && cellM === todayM && cellD === todayD,
      notes: buckets.get(localIsoKey(cellDate)) ?? [],
    });
  }

  return cells;
}
