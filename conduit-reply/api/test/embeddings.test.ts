import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedText, EMBEDDING_DIM } from '../src/embeddings.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('embedText', () => {
  it('returns reproducible embeddings of the expected length', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const first = await embedText('hello world');
    const second = await embedText('hello world');
    expect(first).toHaveLength(EMBEDDING_DIM);
    expect(second).toHaveLength(EMBEDDING_DIM);
    expect(first).toEqual(second);
  });

  it('returns different embeddings for different inputs', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(await embedText('hello world')).not.toEqual(await embedText('goodbye world'));
  });

  it('returns finite values in the expected range', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const embedding = await embedText('hello world');
    expect(
      embedding.every((value) => Number.isFinite(value) && value >= -1 && value <= 1),
    ).toBe(true);
  });
});
