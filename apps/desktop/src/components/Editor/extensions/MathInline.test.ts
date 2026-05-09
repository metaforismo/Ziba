import { describe, expect, it } from 'vitest';
import { scanInlineMath } from './MathInline';

// scanInlineMath powers the markdown-it inline rule that recognises
// `$...$` as math. Its job is to be conservative: the cost of a false
// positive (chewing through prose like "Pago $5+$10 totale") is much
// higher than a false negative (one stray formula that needs `\(...\)`
// or a $$-block). These tests pin down the Pandoc-style symmetric
// guard rules.

describe('scanInlineMath — currency / negative cases', () => {
  it('rejects `$5+$10` opener preceded by whitespace, closer followed by whitespace', () => {
    const src = 'Pago $5+$10 totale';
    // Position 5 is the first `$`. Without the symmetric prev-digit
    // guard the original parser would close at position 8 (the second
    // `$`), grabbing "5+$10" as a formula. The fix on the close side
    // (afterClose=digit) was not enough — '0 ' (space after the second
    // `$`'s closer candidate at pos 11) flips the guard.
    expect(scanInlineMath(src, 5)).toBe(-1);
  });

  it('rejects $-after-digit even with valid-looking inner content', () => {
    // "1$x = 5$" — prev is the digit 1, not a separator.
    expect(scanInlineMath('1$x = 5$', 1)).toBe(-1);
  });

  it('rejects opener immediately after backslash (escape)', () => {
    expect(scanInlineMath('\\$x$', 1)).toBe(-1);
  });

  it('rejects whitespace right after opener', () => {
    expect(scanInlineMath('$ x$', 0)).toBe(-1);
  });

  it('rejects `$$` opener (handled by MathBlock)', () => {
    expect(scanInlineMath('$$x$$', 0)).toBe(-1);
  });

  it('rejects when closer is preceded by whitespace', () => {
    expect(scanInlineMath('$x $', 0)).toBe(-1);
  });

  it('rejects when closer is followed by digit', () => {
    expect(scanInlineMath('$x = 5$10', 0)).toBe(-1);
  });

  it('rejects on newline inside', () => {
    expect(scanInlineMath('$x\ny$', 0)).toBe(-1);
  });

  it('returns -1 when no closing delimiter exists', () => {
    expect(scanInlineMath('$x = 5', 0)).toBe(-1);
  });

  it('returns -1 when called on a non-`$` position', () => {
    expect(scanInlineMath('hello', 0)).toBe(-1);
  });
});

describe('scanInlineMath — positive cases', () => {
  it('matches a simple `$x$`', () => {
    expect(scanInlineMath('$x$', 0)).toBe(2);
  });

  it('matches `$E = mc^2$`', () => {
    const src = '$E = mc^2$';
    expect(scanInlineMath(src, 0)).toBe(src.length - 1);
  });

  it('matches even when preceded by punctuation (non-digit)', () => {
    // `(opener prev = '(' is not a digit, not whitespace requirement
    // applies only to the *post-opener* char; we accept any non-digit
    // prev).
    expect(scanInlineMath('($x$)', 1)).toBe(3);
  });

  it('matches with start-of-string opener', () => {
    expect(scanInlineMath('$x$', 0)).toBe(2);
  });

  it('treats `\\$` inside as part of the formula and continues scanning', () => {
    // `$a \$ b$` — the inner `\$` is escaped and consumed as two
    // characters; the real closer is at the end.
    const src = '$a \\$ b$';
    expect(scanInlineMath(src, 0)).toBe(src.length - 1);
  });

  it('treats `\\\\` inside as two escape chars', () => {
    const src = '$a\\\\b$';
    expect(scanInlineMath(src, 0)).toBe(src.length - 1);
  });
});
