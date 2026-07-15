import { createHash } from 'node:crypto';

export const EMBEDDING_DIM = 1536;

function fallbackEmbedding(text: string): number[] {
  const embedding: number[] = [];
  let counter = 0;

  while (embedding.length < EMBEDDING_DIM) {
    const digest = createHash('sha256').update(`${text}:${counter}`).digest();
    counter += 1;
    for (
      let offset = 0;
      offset + 4 <= digest.length && embedding.length < EMBEDDING_DIM;
      offset += 4
    ) {
      const value = digest.readUInt32BE(offset);
      embedding.push((value / 0xffffffff) * 2 - 1);
    }
  }

  return embedding;
}

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
      });
      if (!response.ok) throw new Error(`OpenAI API returned ${response.status}`);
      const body = await response.json() as { data?: Array<{ embedding?: unknown }> };
      const embedding = body.data?.[0]?.embedding;
      if (
        !Array.isArray(embedding) ||
        embedding.length !== EMBEDDING_DIM ||
        !embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
      ) {
        throw new Error('OpenAI API returned a malformed embedding');
      }
      return embedding as number[];
    } catch (error) {
      console.warn('OpenAI embedding failed; using deterministic fallback', error);
    }
  }

  return fallbackEmbedding(text);
}

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
