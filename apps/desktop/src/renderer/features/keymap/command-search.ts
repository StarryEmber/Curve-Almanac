/**
 * Fuzzy command search for the palette (T5.4).
 *
 * Deliberately dependency-free: a subsequence matcher over the localized label
 * and the command id is enough for a few dozen commands, and it keeps the
 * palette bundle small (AGENTS §4: no new dependency for ~50 lines).
 */

export interface SearchableCommand {
  id: string;
  label: string;
  /** 0 = most recently used; null when never used. */
  recentRank: number | null;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function isWordStart(text: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  return /[\s\-_/.:]/u.test(text.charAt(index - 1));
}

/**
 * Scores an in-order subsequence match; `null` means no match.
 *
 * Higher is better: contiguous characters, word-start characters and prefixes
 * rank above scattered matches. The small length/index penalties keep short
 * labels stable when several commands contain the same query.
 */
export function fuzzyScore(query: string, candidate: string): number | null {
  const needle = normalizeSearchQuery(query);
  const haystack = candidate.toLowerCase();
  if (needle.length === 0) {
    return 0;
  }
  if (haystack.length === 0) {
    return null;
  }

  let score = 0;
  let searchFrom = 0;
  let previousIndex = -2;

  for (const character of needle) {
    const index = haystack.indexOf(character, searchFrom);
    if (index < 0) {
      return null;
    }

    score += 1;
    if (index === previousIndex + 1) {
      score += 3;
    }
    if (isWordStart(haystack, index)) {
      score += 2;
    }
    score -= Math.min(index, 40) * 0.01;

    previousIndex = index;
    searchFrom = index + 1;
  }

  if (haystack.startsWith(needle)) {
    score += 10;
  }
  score -= Math.max(0, haystack.length - needle.length) * 0.01;
  return score;
}

interface Ranked<T> {
  item: T;
  index: number;
  score: number;
  recentRank: number;
}

function compareRanked<T>(left: Ranked<T>, right: Ranked<T>): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  if (left.recentRank !== right.recentRank) {
    return left.recentRank - right.recentRank;
  }
  return left.index - right.index;
}

/**
 * Filters and ranks palette entries.
 *
 * With an empty query the most recently used commands come first, then the
 * registry order. With a query the score wins; recency only breaks ties.
 * Duplicate ids are collapsed (first occurrence wins).
 */
export function searchCommandItems<T extends SearchableCommand>(
  items: readonly T[],
  query: string,
): T[] {
  const needle = normalizeSearchQuery(query);
  const seen = new Set<string>();
  const ranked: Ranked<T>[] = [];

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      return;
    }
    seen.add(item.id);

    const recentRank = item.recentRank === null ? Number.POSITIVE_INFINITY : item.recentRank;

    if (needle.length === 0) {
      ranked.push({ item, index, score: 0, recentRank });
      return;
    }

    const labelScore = fuzzyScore(needle, item.label);
    const idScore = fuzzyScore(needle, item.id);
    if (labelScore === null && idScore === null) {
      return;
    }
    const score = labelScore ?? (idScore ?? 0) - 1;
    ranked.push({ item, index, score, recentRank });
  });

  ranked.sort(compareRanked);
  return ranked.map((entry) => entry.item);
}
