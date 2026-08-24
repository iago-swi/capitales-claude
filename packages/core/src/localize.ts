import type { Country, CountryRecord, Lang } from './types.js';

/**
 * Collapses a multilingual record to a single-language `Country`.
 *
 * This is the whole localisation boundary for game data. Everything downstream
 * — question generation, distractor selection, answer matching, the reducer —
 * works with plain `Country` and never learns that another language exists.
 *
 * Because the pool is localised in memory rather than refetched, switching
 * language costs one map over ~193 objects.
 */
export function localize(record: CountryRecord, lang: Lang): Country {
  return {
    code: record.code,
    name: record.name[lang],
    capital: record.capital[lang],
    capitalLonLat: record.capitalLonLat,
    continent: record.continent,
    altCapitals: record.altCapitals[lang],
  };
}

/** Localises a whole pool. */
export function localizeAll(
  records: readonly CountryRecord[],
  lang: Lang,
): Country[] {
  return records.map((r) => localize(r, lang));
}
