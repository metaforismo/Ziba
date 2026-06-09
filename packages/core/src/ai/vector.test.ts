import { describe, expect, it } from 'vitest';
import {
  blobToFloat32,
  cosineSimilarity,
  float32ToBlob,
  hashContent,
  prepareEmbedText,
} from './vector.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors (identity)', () => {
    const a = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6);
  });

  it('is symmetric: cos(a,b) === cos(b,a)', () => {
    const a = new Float32Array([0.2, -0.5, 0.9, 0.1]);
    const b = new Float32Array([0.7, 0.3, -0.2, 0.8]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 6);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 6);
  });

  it('is scale-invariant', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([2, 4, 6]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  it('returns 0 when either vector is all-zero (avoids NaN)', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 on length mismatch rather than throwing', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe('float32ToBlob / blobToFloat32', () => {
  it('round-trips a vector exactly', () => {
    const v = new Float32Array([0, 1, -1, 0.5, -0.25, 3.14159, 1e-7, -2e8]);
    const blob = float32ToBlob(v);
    const back = blobToFloat32(blob);
    expect(Array.from(back)).toEqual(Array.from(v));
  });

  it('produces a little-endian byte layout', () => {
    // 1.0 in IEEE-754 little-endian is 00 00 80 3F.
    const blob = float32ToBlob(new Float32Array([1]));
    expect(Array.from(blob)).toEqual([0x00, 0x00, 0x80, 0x3f]);
  });

  it('blob length is 4 bytes per element', () => {
    const v = new Float32Array([1, 2, 3, 4, 5]);
    expect(float32ToBlob(v).length).toBe(20);
  });

  it('round-trips an empty vector', () => {
    const back = blobToFloat32(float32ToBlob(new Float32Array([])));
    expect(back.length).toBe(0);
  });
});

describe('hashContent', () => {
  it('is stable: same input → same hash', () => {
    expect(hashContent('ciao mondo')).toBe(hashContent('ciao mondo'));
  });

  it('differs for different input', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'));
  });

  it('returns a hex string', () => {
    expect(hashContent('x')).toMatch(/^[0-9a-f]+$/);
  });
});

describe('prepareEmbedText', () => {
  it('combines title and body', () => {
    expect(prepareEmbedText('Titolo', 'corpo')).toContain('Titolo');
    expect(prepareEmbedText('Titolo', 'corpo')).toContain('corpo');
  });

  it('truncates to the max length', () => {
    const long = 'x'.repeat(5000);
    expect(prepareEmbedText('T', long).length).toBeLessThanOrEqual(2000);
  });

  it('trims surrounding whitespace', () => {
    expect(prepareEmbedText('  T  ', '  body  ')).toBe('T\n\nbody');
  });
});
