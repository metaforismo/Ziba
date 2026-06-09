import { describe, expect, it } from 'vitest';
import { FakeEmbeddingProvider } from './fake-provider.js';
import { cosineSimilarity } from './vector.js';

describe('FakeEmbeddingProvider', () => {
  it('is deterministic: same input → same vector', async () => {
    const p = new FakeEmbeddingProvider();
    const [a] = await p.embed(['ciao mondo']);
    const [b] = await p.embed(['ciao mondo']);
    expect(Array.from(a!)).toEqual(Array.from(b!));
  });

  it('different inputs → different vectors', async () => {
    const p = new FakeEmbeddingProvider();
    const [a] = await p.embed(['gatto']);
    const [b] = await p.embed(['quantistica']);
    expect(Array.from(a!)).not.toEqual(Array.from(b!));
  });

  it('returns one vector per input, in order, all of the fixed dim', async () => {
    const p = new FakeEmbeddingProvider(16);
    const out = await p.embed(['x', 'y', 'z']);
    expect(out).toHaveLength(3);
    for (const v of out) expect(v.length).toBe(16);
  });

  it('produces unit-norm vectors so cosine ranking is well-behaved', async () => {
    const p = new FakeEmbeddingProvider();
    const [v] = await p.embed(['qualcosa']);
    expect(cosineSimilarity(v!, v!)).toBeCloseTo(1, 5);
  });

  it('ranks similar strings closer than dissimilar ones', async () => {
    // Shared-token strings should land nearer each other than an unrelated
    // string — enough signal to test ranking order end-to-end.
    const p = new FakeEmbeddingProvider();
    const [base, near, far] = await p.embed([
      'machine learning models',
      'machine learning training',
      'banana bread recipe',
    ]);
    const simNear = cosineSimilarity(base!, near!);
    const simFar = cosineSimilarity(base!, far!);
    expect(simNear).toBeGreaterThan(simFar);
  });

  it('has a stable id', () => {
    expect(new FakeEmbeddingProvider().id).toBe('fake:hash-32');
  });

  it('handles empty string without throwing', async () => {
    const p = new FakeEmbeddingProvider();
    const [v] = await p.embed(['']);
    expect(v!.length).toBeGreaterThan(0);
  });
});
