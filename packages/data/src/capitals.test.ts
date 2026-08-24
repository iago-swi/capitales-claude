import { describe, expect, it } from 'vitest';
import type { CountryRecord, Lang } from '@capitales/core';
import capitals from '../capitals.json' with { type: 'json' };
import topo from '../countries.topo.json' with { type: 'json' };

const countries = capitals as CountryRecord[];
const LANGS: Lang[] = ['en', 'fr'];

describe('capitals.json', () => {
  it('contains the expected number of countries', () => {
    expect(countries).toHaveLength(193);
  });

  it('has a unique, well-formed code for every country', () => {
    const codes = countries.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{3}$/);
  });

  it('is sorted by code, so diffs stay readable', () => {
    const codes = countries.map((c) => c.code);
    expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)));
  });

  it('gives every country a non-empty name and capital in every language', () => {
    for (const c of countries) {
      for (const lang of LANGS) {
        expect(c.name[lang].length, `${c.code} name.${lang}`).toBeGreaterThan(0);
        expect(c.capital[lang].length, `${c.code} capital.${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every country the same number of alternates in each language', () => {
    for (const c of countries) {
      expect(c.altCapitals.fr.length, c.code).toBe(c.altCapitals.en.length);
    }
  });

  it('translates the capitals that genuinely differ in French', () => {
    const byCode = new Map(countries.map((c) => [c.code, c]));
    expect(byCode.get('BEL')?.capital.fr).toBe('Bruxelles');
    expect(byCode.get('CHN')?.capital.fr).toBe('Pékin');
    expect(byCode.get('SDS')?.capital.fr).toBe('Djouba');
    expect(byCode.get('DEU')?.name.fr).toBe('Allemagne');
  });

  it('resolves French alternates from the dataset, not by copying English', () => {
    const zaf = countries.find((c) => c.code === 'ZAF');
    expect(zaf?.altCapitals.en).toContain('Cape Town');
    expect(zaf?.altCapitals.fr).toContain('Le Cap');
  });

  it('keeps every capital coordinate in range and in [lon, lat] order', () => {
    for (const c of countries) {
      const [lon, lat] = c.capitalLonLat;
      expect(lon, `${c.code} lon`).toBeGreaterThanOrEqual(-180);
      expect(lon, `${c.code} lon`).toBeLessThanOrEqual(180);
      expect(lat, `${c.code} lat`).toBeGreaterThanOrEqual(-90);
      expect(lat, `${c.code} lat`).toBeLessThanOrEqual(90);
    }
  });

  it('carries no fields the application does not use', () => {
    // `centroid` was removed once fitCountry started deriving its own from the
    // capital's landmass. Regenerating the ETL must not quietly reintroduce it.
    for (const c of countries) {
      expect(Object.keys(c).sort()).toEqual([
        'altCapitals',
        'capital',
        'capitalLonLat',
        'code',
        'continent',
        'name',
      ]);
      expect(Object.keys(c.name).sort()).toEqual(['en', 'fr']);
      expect(Object.keys(c.capital).sort()).toEqual(['en', 'fr']);
      expect(Object.keys(c.altCapitals).sort()).toEqual(['en', 'fr']);
    }
  });

  it('never lists the canonical capital among its own alternates', () => {
    for (const c of countries) {
      for (const lang of LANGS) {
        expect(c.altCapitals[lang], `${c.code} ${lang}`).not.toContain(c.capital[lang]);
      }
    }
  });

  it('includes the countries the -99 ISO sentinel would have dropped', () => {
    // Natural Earth sets ISO_A3 = -99 for these. Joining on ISO loses them.
    for (const code of ['FRA', 'NOR']) {
      expect(countries.find((c) => c.code === code), code).toBeDefined();
    }
    expect(countries.find((c) => c.code === 'FRA')?.capital.en).toBe('Paris');
  });

  it('applies the hand-curated overrides', () => {
    const zaf = countries.find((c) => c.code === 'ZAF');
    expect(zaf?.capital.en).toBe('Pretoria');
    expect(zaf?.altCapitals.en).toContain('Cape Town');
    // Johannesburg is mis-tagged as an Admin-0 capital and must not appear.
    expect(zaf?.altCapitals.en).not.toContain('Johannesburg');

    expect(countries.find((c) => c.code === 'BOL')?.capital.en).toBe('Sucre');
    expect(countries.find((c) => c.code === 'SDS')?.capital.en).toBe('Juba');
    expect(countries.find((c) => c.code === 'NRU')?.capital.en).toBe('Yaren');
  });

  it('excludes dependencies and disputed entities', () => {
    for (const code of ['GRL', 'HKG', 'JEY', 'CYN', 'ABW']) {
      expect(countries.find((c) => c.code === code), code).toBeUndefined();
    }
  });

  it('includes the small states that the 50m dataset makes playable', () => {
    for (const code of ['SGP', 'MLT', 'MCO', 'VAT']) {
      expect(countries.find((c) => c.code === code), code).toBeDefined();
    }
  });

  it('has a geometry feature for every country and vice versa', () => {
    const geoIds = new Set(
      (topo as { objects: { countries: { geometries: { id: string }[] } } })
        .objects.countries.geometries.map((g) => g.id),
    );
    for (const c of countries) {
      expect(geoIds.has(c.code), `no geometry for ${c.code}`).toBe(true);
    }
    expect(geoIds.size).toBe(countries.length);
  });

  it('assigns every country a known continent', () => {
    const known = new Set([
      'Africa',
      'Asia',
      'Europe',
      'North America',
      'South America',
      'Oceania',
      'Seven seas (open ocean)',
    ]);
    for (const c of countries) {
      expect(known.has(c.continent), `${c.code}: ${c.continent}`).toBe(true);
    }
  });
});
