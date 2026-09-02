// @ts-check
/* Pure local note-search ranking and excerpt generation. */
{
  ('use strict');

  /** @typedef {{ id: string, title?: string, body?: string, tags?: string[], updatedAt?: number, archivedAt?: number, deletedAt?: number }} SearchNote */
  /** @typedef {{ note: SearchNote, kind: 'direct' | 'close', score: number, highlightTerms: string[], excerpt: string }} SearchResult */
  /** @typedef {{ raw: string, phrase: string, terms: string[] }} QueryInfo */
  /** @typedef {{ tags: string[], titles: string[], folders: string[] }} QueryFilters */
  /** @typedef {{ text: string, filters: QueryFilters }} ParsedQuery */
  /** @typedef {(note: SearchNote) => string} FolderNameOf */
  /** @typedef {{ kind: 'direct' | 'close', results: SearchResult[] }} RankedNotes */
  /** @typedef {RankedNotes & ParsedQuery} SearchOutcome */
  /** @typedef {{ rankNotes(notes: SearchNote[], query: string): RankedNotes, searchNotes(notes: SearchNote[], query: string, options?: { folderNameOf?: FolderNameOf }): SearchOutcome, parseQuery(query: string): ParsedQuery, normalize(value: unknown): string, matchesLoose(text: string, query: string): boolean }} SearchApi */

  /** @param {unknown} value */
  function normalize(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** @param {string} haystack @param {string} query */
  function looseIncludes(haystack, query) {
    let position = 0;
    for (const character of query) {
      position = haystack.indexOf(character, position);
      if (position === -1) return false;
      position += 1;
    }
    return true;
  }

  /** @param {string} text @param {string} query */
  function matchesLoose(text, query) {
    const needle = normalize(query);
    if (!needle) return true;
    const haystack = normalize(text);
    return haystack.includes(needle) || looseIncludes(haystack, needle);
  }

  /** @param {unknown} value */
  function words(value) {
    return normalize(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  /** @param {string} query */
  function queryInfo(query) {
    return { raw: query.trim(), phrase: normalize(query), terms: words(query) };
  }

  const OPERATOR_PATTERN = /(^|\s)(tag|title|folder):(\S*)/giu;

  /** @param {QueryFilters} filters @param {string} key */
  function filterBucket(filters, key) {
    const lower = key.toLowerCase();
    if (lower === 'tag') return filters.tags;
    if (lower === 'title') return filters.titles;
    return filters.folders;
  }

  /** @param {string} query @returns {ParsedQuery} */
  function parseQuery(query) {
    /** @type {QueryFilters} */
    const filters = { tags: [], titles: [], folders: [] };
    const text = String(query || '')
      .replace(OPERATOR_PATTERN, (_match, lead, key, value) => {
        const normalized = normalize(value);
        if (normalized) filterBucket(filters, key).push(normalized);
        return lead;
      })
      .replace(/\s+/g, ' ')
      .trim();
    return { text, filters };
  }

  /** @param {SearchNote} note @param {QueryFilters} filters @param {FolderNameOf | undefined} folderNameOf */
  function passesFilters(note, filters, folderNameOf) {
    const tags = (note.tags || []).map(normalize);
    if (!filters.tags.every((value) => tags.includes(value))) return false;
    const title = normalize(note.title);
    if (!filters.titles.every((value) => title.includes(value))) return false;
    const folder = normalize(folderNameOf ? folderNameOf(note) : '');
    return filters.folders.every((value) => folder.includes(value));
  }

  /** @param {string} text @param {string[]} terms */
  function includesEvery(text, terms) {
    return terms.length > 0 && terms.every((term) => text.includes(term));
  }

  /** @param {SearchNote} note @param {QueryInfo} query */
  function directScore(note, query) {
    const title = normalize(note.title);
    const tags = normalize((note.tags || []).join(' '));
    const body = normalize(note.body);
    const all = [title, tags, body].join(' ');
    if (title.includes(query.phrase)) return 600;
    if (includesEvery(title, query.terms)) return 550;
    if (tags.includes(query.phrase)) return 500;
    if (includesEvery(tags, query.terms)) return 450;
    if (body.includes(query.phrase)) return 400;
    if (includesEvery(all, query.terms)) return 300;
    return 0;
  }

  /** @param {string} left @param {string} right */
  function editDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= right.length; column += 1) {
        const cost = left[row - 1] === right[column - 1] ? 0 : 1;
        current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + cost);
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[right.length];
  }

  /** @param {string} term */
  function distanceLimit(term) {
    if (term.length < 3) return 0;
    if (term.length <= 5) return 1;
    return 2;
  }

  /** @param {string} term @param {string[]} candidates */
  function closestWord(term, candidates) {
    const limit = distanceLimit(term);
    let closest = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (Math.abs(candidate.length - term.length) > limit) continue;
      const nextDistance = editDistance(term, candidate);
      if (nextDistance < distance) [closest, distance] = [candidate, nextDistance];
    }
    return closest && distance <= limit ? { word: closest, distance } : null;
  }

  /** @param {SearchNote} note @param {QueryInfo} query */
  function fuzzyMatch(note, query) {
    const candidates = [...new Set(words([note.title || '', ...(note.tags || [])].join(' ')))];
    const matches = query.terms.map((term) => closestWord(term, candidates));
    if (!matches.length || matches.some((match) => !match)) return null;
    const distance = matches.reduce((total, match) => total + (match ? match.distance : 0), 0);
    return { score: 200 - distance * 20, terms: matches.map((match) => (match ? match.word : '')) };
  }

  /** @param {string} body */
  function plainBody(body) {
    return String(body || '')
      .replace(/```[^\n]*\n?/g, ' ')
      .replace(/```/g, ' ')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** @param {string} text @param {QueryInfo} query */
  function matchPosition(text, query) {
    const lower = text.toLocaleLowerCase();
    const phraseIndex = lower.indexOf(query.raw.toLocaleLowerCase());
    if (phraseIndex >= 0) return { index: phraseIndex, length: query.raw.length };
    const positions = query.terms
      .map((term) => ({ index: normalize(text).indexOf(term), length: term.length }))
      .filter((position) => position.index >= 0)
      .sort((left, right) => left.index - right.index);
    return positions[0] || null;
  }

  /** @param {string} text @param {number} index @param {number} length */
  function clipAround(text, index, length) {
    let start = Math.max(0, index - 48);
    let end = Math.min(text.length, index + length + 76);
    if (start > 0) start = text.indexOf(' ', start) + 1 || start;
    if (end < text.length) end = text.lastIndexOf(' ', end) || end;
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    return prefix + text.slice(start, end).trim() + suffix;
  }

  /** @param {string} text */
  function leadExcerpt(text) {
    return text.length > 112 ? text.slice(0, 111).trimEnd() + '…' : text;
  }

  /** @param {SearchNote} note @param {QueryInfo} query */
  function resultExcerpt(note, query) {
    const text = plainBody(note.body || '');
    if (!text) return '';
    const position = matchPosition(text, query);
    return position ? clipAround(text, position.index, position.length) : leadExcerpt(text);
  }

  /** @param {SearchNote} note */
  function noteTime(note) {
    return note.deletedAt || note.archivedAt || note.updatedAt || 0;
  }

  /** @param {SearchResult} left @param {SearchResult} right */
  function compareResults(left, right) {
    return right.score - left.score || noteTime(right.note) - noteTime(left.note);
  }

  /** @param {SearchNote[]} notes @param {string} query @returns {{ kind: 'direct' | 'close', results: SearchResult[] }} */
  function rankNotes(notes, query) {
    const info = queryInfo(query);
    if (!info.phrase) return { kind: 'direct', results: [] };
    const direct = notes
      .map((note) => ({ note, score: directScore(note, info) }))
      .filter((candidate) => candidate.score > 0)
      .map(({ note, score }) => ({
        note,
        score,
        kind: /** @type {'direct'} */ ('direct'),
        highlightTerms: [info.raw, ...info.terms],
        excerpt: resultExcerpt(note, info),
      }))
      .sort(compareResults);
    if (direct.length || !info.terms.length) return { kind: 'direct', results: direct };
    return fuzzyResults(notes, info);
  }

  /** @param {SearchNote[]} notes @param {QueryInfo} info */
  function fuzzyResults(notes, info) {
    const results = [];
    for (const note of notes) {
      const match = fuzzyMatch(note, info);
      if (!match) continue;
      results.push({
        note,
        score: match.score,
        kind: /** @type {'close'} */ ('close'),
        highlightTerms: match.terms,
        excerpt: resultExcerpt(note, info),
      });
    }
    return {
      kind: results.length ? /** @type {'close'} */ ('close') : /** @type {'direct'} */ ('direct'),
      results: results.sort(compareResults),
    };
  }

  /** @param {SearchNote[]} notes @returns {RankedNotes} */
  function recentResults(notes) {
    const results = notes.map((note) => ({
      note,
      score: 0,
      kind: /** @type {'direct'} */ ('direct'),
      highlightTerms: [],
      excerpt: leadExcerpt(plainBody(note.body || '')),
    }));
    return { kind: 'direct', results: results.sort(compareResults) };
  }

  /** @param {SearchNote[]} notes @param {string} query @param {{ folderNameOf?: FolderNameOf }} [options] @returns {SearchOutcome} */
  function searchNotes(notes, query, options) {
    const parsed = parseQuery(query);
    const folderNameOf = options ? options.folderNameOf : undefined;
    const scoped = notes.filter((note) => passesFilters(note, parsed.filters, folderNameOf));
    const ranked = parsed.text ? rankNotes(scoped, parsed.text) : recentResults(scoped);
    return { ...ranked, ...parsed };
  }

  /** @type {Window & typeof globalThis & { ScratchpadSearch?: SearchApi }} */
  const root = window;
  root.ScratchpadSearch = Object.freeze({ rankNotes, searchNotes, parseQuery, normalize, matchesLoose });
}
