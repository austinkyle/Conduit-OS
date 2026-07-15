export function extractOrderIds(text: string): string[] {
  try {
    const results: string[] = [];
    const seen = new Set<string>();
    const pattern = /#(\d{3,})|\border\b\s*(?:(?:number)\s*)?#?\s*(\d{3,})/gi;
    for (const match of text.matchAll(pattern)) {
      const id = match[1] ?? match[2];
      if (!seen.has(id)) {
        seen.add(id);
        results.push(id);
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function extractSkus(text: string): string[] {
  try {
    const results: string[] = [];
    const seen = new Set<string>();
    const pattern = /\b(?=[a-z0-9-]{5,}\b)(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)(?=[a-z0-9-]*-)[a-z0-9]+(?:-[a-z0-9]+)+\b/gi;
    for (const match of text.matchAll(pattern)) {
      const sku = match[0].toUpperCase();
      if (!seen.has(sku)) {
        seen.add(sku);
        results.push(sku);
      }
    }
    return results;
  } catch {
    return [];
  }
}
