const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'were',
  'with',
]);

const hasVowel = (value: string): boolean => /[aeiou]/u.test(value);

const trimDoubleConsonant = (value: string): string => {
  if (value.length < 3) {
    return value;
  }

  if (/([b-df-hj-np-tv-z])\1$/u.test(value) && !/(ll|ss|zz)$/u.test(value)) {
    return value.slice(0, -1);
  }

  return value;
};

export const stem = (term: string): string => {
  let value = term.toLowerCase().trim();
  if (value.length <= 2) {
    return value;
  }

  if (value.endsWith('sses')) {
    value = `${value.slice(0, -4)}ss`;
  } else if (value.endsWith('ies') && value.length > 4) {
    value = `${value.slice(0, -3)}y`;
  } else if (value.endsWith('s') && !value.endsWith('ss') && value.length > 3) {
    value = value.slice(0, -1);
  }

  const suffixes: Array<{replacement: string; suffix: string}> = [
    {replacement: '', suffix: 'ingly'},
    {replacement: '', suffix: 'edly'},
    {replacement: '', suffix: 'ing'},
    {replacement: '', suffix: 'ed'},
    {replacement: '', suffix: 'ly'},
    {replacement: '', suffix: 'ment'},
    {replacement: 'ate', suffix: 'ation'},
    {replacement: 'ize', suffix: 'ization'},
    {replacement: 'al', suffix: 'ally'},
    {replacement: '', suffix: 'ness'},
    {replacement: '', suffix: 'ful'},
    {replacement: '', suffix: 'er'},
  ];

  for (const entry of suffixes) {
    if (!value.endsWith(entry.suffix) || value.length <= entry.suffix.length + 1) {
      continue;
    }

    const candidate = `${value.slice(0, -entry.suffix.length)}${entry.replacement}`;
    if (!hasVowel(candidate)) {
      continue;
    }

    value = trimDoubleConsonant(candidate);
    break;
  }

  if (value.endsWith('tion') && value.length > 5) {
    value = `${value.slice(0, -3)}e`;
  }

  return value;
};

export const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map((token) => stem(token))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
};

const mapToEntries = (value: Map<string, number>): Array<[string, number]> => {
  return Array.from(value.entries()).sort(([left], [right]) => left.localeCompare(right));
};

interface SerializedTextIndex {
  documents: Array<[string, Array<[string, number]>]>;
}

export class TextIndex {
  private readonly documents = new Map<string, Map<string, number>>();
  private readonly documentLengths = new Map<string, number>();
  private readonly postings = new Map<string, Map<string, number>>();

  get size(): number {
    return this.documents.size;
  }

  add(id: string, text: string): void {
    this.remove(id);

    const counts = new Map<string, number>();
    for (const token of tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    if (counts.size === 0) {
      return;
    }

    this.documents.set(id, counts);
    this.documentLengths.set(id, Array.from(counts.values()).reduce((sum, count) => sum + count, 0));

    for (const [term, count] of counts.entries()) {
      const postings = this.postings.get(term) ?? new Map<string, number>();
      postings.set(id, count);
      this.postings.set(term, postings);
    }
  }

  remove(id: string): void {
    const existing = this.documents.get(id);
    if (!existing) {
      return;
    }

    for (const term of existing.keys()) {
      const postings = this.postings.get(term);
      if (!postings) {
        continue;
      }

      postings.delete(id);
      if (postings.size === 0) {
        this.postings.delete(term);
      }
    }

    this.documents.delete(id);
    this.documentLengths.delete(id);
  }

  query(text: string, topK: number): Array<{id: string; score: number}> {
    if (topK <= 0) {
      return [];
    }

    const queryCounts = new Map<string, number>();
    for (const token of tokenize(text)) {
      queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1);
    }

    if (queryCounts.size === 0 || this.documents.size === 0) {
      return [];
    }

    const scores = new Map<string, number>();
    for (const [term, queryCount] of queryCounts.entries()) {
      const postings = this.postings.get(term);
      if (!postings || postings.size === 0) {
        continue;
      }

      const idf = Math.log((this.documents.size + 1) / (postings.size + 1)) + 1;
      const queryWeight = (1 + Math.log(queryCount)) * idf;

      for (const [id, documentCount] of postings.entries()) {
        const documentWeight = (1 + Math.log(documentCount)) * idf;
        const length = Math.sqrt(this.documentLengths.get(id) ?? 1);
        scores.set(id, (scores.get(id) ?? 0) + (documentWeight * queryWeight) / length);
      }
    }

    return Array.from(scores.entries())
      .filter(([, score]) => Number.isFinite(score) && score > 0)
      .map(([id, score]) => ({id, score: Number(score.toFixed(6))}))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.id.localeCompare(right.id);
      })
      .slice(0, topK);
  }

  serialize(): string {
    const serialized: SerializedTextIndex = {
      documents: Array.from(this.documents.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, counts]) => [id, mapToEntries(counts)]),
    };
    return JSON.stringify(serialized, null, 2);
  }

  static deserialize(json: string): TextIndex {
    const parsed = JSON.parse(json) as Partial<SerializedTextIndex>;
    if (!Array.isArray(parsed.documents)) {
      throw new Error('Invalid text index payload');
    }

    const index = new TextIndex();
    for (const entry of parsed.documents) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) {
        throw new Error('Invalid text index entry');
      }

      const [id, counts] = entry;
      const restored = new Map<string, number>();
      for (const countEntry of counts) {
        if (!Array.isArray(countEntry) || typeof countEntry[0] !== 'string' || typeof countEntry[1] !== 'number') {
          throw new Error('Invalid text index term entry');
        }

        restored.set(countEntry[0], countEntry[1]);
      }

      index.documents.set(id, restored);
      index.documentLengths.set(id, Array.from(restored.values()).reduce((sum, count) => sum + count, 0));
      for (const [term, count] of restored.entries()) {
        const postings = index.postings.get(term) ?? new Map<string, number>();
        postings.set(id, count);
        index.postings.set(term, postings);
      }
    }

    return index;
  }
}