import { describe, it, expect } from 'vitest';
import type { DatabaseRow } from '../../../../shared/ipc';
import { buildMonthGrid, formatMonthTitle, normalizeIsoDate } from './helpers';

// Pure helper tests. We deliberately don't render the components in
// vitest — the renderer integration is covered by manual QA — but
// the date math here is fiddly (Monday-first weeks, DST edges,
// month boundaries), so it earns its own unit tests.

function makeRow(path: string, due: string): DatabaseRow {
  return {
    path,
    title: path.replace(/\.md$/, ''),
    mtimeMs: 0,
    properties: {
      due: { key: 'due', type: 'date', value: due },
    },
  };
}

describe('normalizeIsoDate', () => {
  it('accepts a valid ISO YYYY-MM-DD', () => {
    expect(normalizeIsoDate('2026-05-09')).toBe('2026-05-09');
  });

  it('rejects non-strings', () => {
    expect(normalizeIsoDate(20260509)).toBeNull();
    expect(normalizeIsoDate(null)).toBeNull();
    expect(normalizeIsoDate(undefined)).toBeNull();
    expect(normalizeIsoDate(['2026-05-09'])).toBeNull();
  });

  it('rejects malformed strings', () => {
    expect(normalizeIsoDate('2026-5-9')).toBeNull();
    expect(normalizeIsoDate('2026/05/09')).toBeNull();
    expect(normalizeIsoDate('not-a-date')).toBeNull();
    expect(normalizeIsoDate('')).toBeNull();
  });

  it('rejects calendar-invalid dates that match the regex', () => {
    // Feb 30 looks like an ISO date but isn't a real day; the JS Date
    // constructor would silently roll over to March, hiding the bug.
    expect(normalizeIsoDate('2026-02-30')).toBeNull();
    expect(normalizeIsoDate('2026-13-01')).toBeNull();
  });
});

describe('formatMonthTitle', () => {
  it('returns capitalised italian month + year', () => {
    expect(formatMonthTitle(2026, 4)).toBe('Maggio 2026');
    expect(formatMonthTitle(2026, 0)).toBe('Gennaio 2026');
  });
});

describe('buildMonthGrid', () => {
  it('always starts on a Monday', () => {
    // May 2026: 1st falls on a Friday. The grid origin should be
    // Mon 27 Apr 2026.
    const cells = buildMonthGrid(2026, 4, [], 'due');
    const first = cells[0]!;
    expect(first.date.getDate()).toBe(27);
    expect(first.date.getMonth()).toBe(3); // April
    expect(first.isCurrentMonth).toBe(false);
  });

  it('marks days in the requested month as in-month', () => {
    const cells = buildMonthGrid(2026, 4, [], 'due');
    const inMonth = cells.filter((c) => c.isCurrentMonth);
    expect(inMonth.length).toBe(31); // May has 31 days
  });

  it('emits 35 cells when the month fits in 5 rows, 42 otherwise', () => {
    // Feb 2026: 1st is Sunday, 28 days. 6 + 28 = 34 → 35 cells.
    expect(buildMonthGrid(2026, 1, [], 'due').length).toBe(35);
    // May 2026: 1st is Friday, 31 days. 4 + 31 = 35 → still 35 cells.
    expect(buildMonthGrid(2026, 4, [], 'due').length).toBe(35);
    // Jan 2026: 1st is Thursday, 31 days. 3 + 31 = 34 → 35 cells.
    expect(buildMonthGrid(2026, 0, [], 'due').length).toBe(35);
    // Aug 2026: 1st is Saturday, 31 days. 5 + 31 = 36 → 42 cells.
    expect(buildMonthGrid(2026, 7, [], 'due').length).toBe(42);
  });

  it('buckets rows by their date property value', () => {
    const rows: DatabaseRow[] = [
      makeRow('a.md', '2026-05-09'),
      makeRow('b.md', '2026-05-09'),
      makeRow('c.md', '2026-05-15'),
      makeRow('d.md', '2026-06-01'), // out of month — bucketed only if cell visible
    ];
    const cells = buildMonthGrid(2026, 4, rows, 'due');
    const may9 = cells.find((c) => c.date.getDate() === 9 && c.isCurrentMonth)!;
    expect(may9.notes.map((n) => n.path)).toEqual(['a.md', 'b.md']);

    const may15 = cells.find((c) => c.date.getDate() === 15 && c.isCurrentMonth)!;
    expect(may15.notes.map((n) => n.path)).toEqual(['c.md']);
  });

  it('ignores rows with non-date or invalid values', () => {
    const rows: DatabaseRow[] = [
      // text-typed property: shouldn't be bucketed
      {
        path: 'x.md',
        title: 'x',
        mtimeMs: 0,
        properties: { due: { key: 'due', type: 'text', value: '2026-05-09' } },
      },
      // missing property entirely
      { path: 'y.md', title: 'y', mtimeMs: 0, properties: {} },
    ];
    const cells = buildMonthGrid(2026, 4, rows, 'due');
    for (const cell of cells) {
      expect(cell.notes).toEqual([]);
    }
  });

  it('marks today exactly once when "today" lands inside the visible grid', () => {
    const now = new Date();
    const cells = buildMonthGrid(now.getFullYear(), now.getMonth(), [], 'due');
    const todays = cells.filter((c) => c.isToday);
    expect(todays.length).toBe(1);
    expect(todays[0]!.date.getDate()).toBe(now.getDate());
  });

  it('navigates across year boundaries cleanly', () => {
    // December 2026 has its trailing days bleed into January 2027.
    const cells = buildMonthGrid(2026, 11, [], 'due');
    const jan2027 = cells.filter((c) => c.date.getFullYear() === 2027);
    expect(jan2027.length).toBeGreaterThan(0);
    for (const c of jan2027) {
      expect(c.isCurrentMonth).toBe(false);
    }
  });

  it('survives the European DST fall-back (last Sunday of October)', () => {
    // 2026-10-25 (Sunday) is the European DST fall-back day. Cell
    // dates are anchored at noon so the wall clock around 03:00 ↔ 02:00
    // can never push a cell into the wrong day. Both adjacent days
    // must appear exactly once in the grid with their expected dates.
    const cells = buildMonthGrid(2026, 9, [], 'due');
    const days = cells.filter((c) => c.isCurrentMonth).map((c) => c.date.getDate());
    // October has 31 days, all of them present.
    expect(days).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    // And the 25th in particular round-trips correctly.
    const oct25 = cells.find((c) => c.isCurrentMonth && c.date.getDate() === 25);
    expect(oct25).toBeDefined();
    expect(oct25!.date.getMonth()).toBe(9);
    expect(oct25!.date.getFullYear()).toBe(2026);
  });
});
