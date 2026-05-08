import type { Frontmatter } from '@synapsium/core';

/**
 * The set of property "types" the v0.2 editor knows how to render.
 *
 * - `text`           single-line string (default fallback for any non-empty
 *                    string that isn't a date/url and any unknown primitive)
 * - `number`         numeric input
 * - `boolean`        checkbox
 * - `date`           ISO date (YYYY-MM-DD) — `<input type="date">`
 * - `url`            HTTP/HTTPS URL — input + open-in-new-tab affordance
 * - `multi-select`   array of strings rendered as removable chips
 * - `tags`           special-cased multi-select for the canonical `tags`
 *                    property; renders identically to `multi-select` but
 *                    keeps an explicit affordance for v0.3 schema work
 * - `unsupported`    catch-all for objects / arrays-of-non-strings — UI
 *                    shows a read-only JSON pretty-print and a notice
 */
export type PropertyType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'url'
  | 'multi-select'
  | 'tags'
  | 'unsupported';

/**
 * The runtime shape of an individual frontmatter value. We keep this
 * permissive (`unknown` for the catch-all) because gray-matter happily
 * surfaces nested objects, arrays-of-numbers, Date instances, etc., and
 * the editor needs to be able to round-trip them without dropping
 * information it doesn't yet understand.
 */
export type PropertyValue = string | number | boolean | string[] | null | unknown;

/**
 * Subset of `PropertyType` the user is allowed to switch BETWEEN through
 * the inline type-switcher dropdown. We deliberately exclude
 * `boolean` / `multi-select` / `tags` from the v0.2 lattice because
 * converting in or out of those cleanly requires more thought than we
 * have time for in MVP — the UI keeps the auto-detected type for those.
 */
export const SWITCHABLE_TYPES = ['text', 'number', 'date', 'url'] as const;
export type SwitchableType = (typeof SWITCHABLE_TYPES)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_RE = /^https?:\/\//i;

/**
 * Best-effort detection of the property type for a given runtime value.
 * Pure function: same input → same output, no side effects, easy to unit
 * test. Rules (first match wins):
 *
 *   1. boolean → 'boolean'
 *   2. number  → 'number'
 *   3. Date    → 'date' (we normalize Date instances upstream, but check
 *                here too so the function is total)
 *   4. string matching `YYYY-MM-DD` → 'date'
 *   5. string matching `^https?://` → 'url'
 *   6. any other string → 'text'
 *   7. array of strings → 'multi-select'
 *   8. anything else (object, array-of-non-strings, null, undefined)
 *      → 'unsupported' for objects and mixed arrays, or 'text' for
 *      null/undefined which we treat as an empty text field.
 *
 * The `keyName` argument upgrades 'multi-select' → 'tags' for the
 * canonical `tags` property so callers can branch UI on the more
 * specific type without re-implementing the rule everywhere.
 */
export function detectPropertyType(value: unknown, keyName?: string): PropertyType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (value instanceof Date) return 'date';
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) return 'date';
    if (HTTP_URL_RE.test(value)) return 'url';
    return 'text';
  }
  if (Array.isArray(value)) {
    // An empty array is ambiguous — we treat it as a multi-select so the
    // user can start adding chips. Mixed / non-string arrays fall through
    // to 'unsupported'.
    if (value.length === 0) {
      return keyName === 'tags' ? 'tags' : 'multi-select';
    }
    if (value.every((v) => typeof v === 'string')) {
      return keyName === 'tags' ? 'tags' : 'multi-select';
    }
    return 'unsupported';
  }
  if (value === null || value === undefined) return 'text';
  // typeof === 'object' (and not array, not Date, not null) → bail.
  return 'unsupported';
}

/**
 * Re-export so callers don't need to import from two places.
 */
export type { Frontmatter };
