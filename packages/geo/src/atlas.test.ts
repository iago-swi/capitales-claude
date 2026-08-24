import { describe, expect, it } from 'vitest';
import type { Topology } from 'topojson-specification';
import topo from '../../data/countries.topo.json' with { type: 'json' };
import { buildAtlas } from './atlas.js';

const atlas = buildAtlas(topo as unknown as Topology);

describe('buildAtlas', () => {
  it('indexes every country by its ADM0_A3 code', () => {
    expect(atlas.size).toBe(193);
  });

  it('finds France, which an ISO-numeric join would have lost', () => {
    const fra = atlas.get('FRA');
    expect(fra).toBeDefined();
    expect(fra?.geometry.type).toMatch(/Polygon$/);
  });

  it('returns undefined for an unknown code rather than throwing', () => {
    expect(atlas.get('ZZZ')).toBeUndefined();
  });

  it('gives every feature non-empty coordinates', () => {
    for (const [code, f] of atlas) {
      expect(f.geometry.coordinates.length, code).toBeGreaterThan(0);
    }
  });

  it('handles both Polygon and MultiPolygon countries', () => {
    const types = new Set([...atlas.values()].map((f) => f.geometry.type));
    expect(types).toContain('Polygon');
    expect(types).toContain('MultiPolygon');
  });
});
