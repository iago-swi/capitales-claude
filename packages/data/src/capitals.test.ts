import { describe, expect, it } from 'vitest';
import type { Country } from '@capitales/core';
import capitals from '../capitals.json' with { type: 'json' };
import topo from '../countries.topo.json' with { type: 'json' };

const countries = capitals as Country[];

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

  it('gives every country a non-empty name and capital', () => {
    for (const c of countries) {
      expect(c.name.length, c.code).toBeGreaterThan(0);
      expect(c.capital.length, c.code).toBeGreaterThan(0);
    }
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
    }
  });

  it('never lists the canonical capital among its own alternates', () => {
    for (const c of countries) {
      expect(c.altCapitals, c.code).not.toContain(c.capital);
    }
  });

  it('includes the countries the -99 ISO sentinel would have dropped', () => {
    // Natural Earth sets ISO_A3 = -99 for these. Joining on ISO loses them.
    for (const code of ['FRA', 'NOR']) {
      expect(countries.find((c) => c.code === code), code).toBeDefined();
    }
    expect(countries.find((c) => c.code === 'FRA')?.capital).toBe('Paris');
  });

  it('applies the hand-curated overrides', () => {
    const zaf = countries.find((c) => c.code === 'ZAF');
    expect(zaf?.capital).toBe('Pretoria');
    expect(zaf?.altCapitals).toContain('Cape Town');
    // Johannesburg is mis-tagged as an Admin-0 capital and must not appear.
    expect(zaf?.altCapitals).not.toContain('Johannesburg');

    expect(countries.find((c) => c.code === 'BOL')?.capital).toBe('Sucre');
    expect(countries.find((c) => c.code === 'SDS')?.capital).toBe('Juba');
    expect(countries.find((c) => c.code === 'NRU')?.capital).toBe('Yaren');
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
