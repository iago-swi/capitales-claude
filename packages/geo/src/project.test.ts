import { describe, expect, it } from 'vitest';
import type { Topology } from 'topojson-specification';
import {
  missDistanceFor,
  PLACE_FULL_KM,
  type CountryRecord,
} from '@capitales/core';
import topo from '../../data/countries.topo.json' with { type: 'json' };
import capitals from '../../data/capitals.json' with { type: 'json' };
import { geoBounds } from 'd3-geo';
import { buildAtlas } from './atlas.js';
import { capitalCluster, fitCountry, offsetFromOutlineKm } from './project.js';
import type { CountryFeature } from './atlas.js';

const atlas = buildAtlas(topo as unknown as Topology);
const countries = capitals as CountryRecord[];
const box = { width: 600, height: 400 };

function get(code: string): CountryRecord {
  const c = countries.find((x) => x.code === code);
  if (!c) throw new Error(`missing test fixture ${code}`);
  return c;
}

function featureFor(code: string) {
  const f = atlas.get(code);
  if (!f) throw new Error(`missing geometry ${code}`);
  return f;
}

/** Widest extent of a feature in degrees — how much world the frame must show. */
function spanDeg(f: CountryFeature): number {
  const [[w, s], [e, n]] = geoBounds(f);
  return Math.max(e - w, n - s);
}

describe('capitalCluster', () => {
  it('drops distant overseas territories so the mainland fills the frame', () => {
    // Natural Earth gives FRA 10 parts spanning lon -61.8 (Guadeloupe) to
    // +55.8 (Réunion). Fitting all of them puts the projection centroid in the
    // Atlantic and renders metropolitan France as a few unrecognisable specks.
    const full = featureFor('FRA');
    expect(spanDeg(full)).toBeGreaterThan(100);
    expect(spanDeg(capitalCluster(full, get('FRA').capitalLonLat))).toBeLessThan(20);
  });

  it('drops the Caribbean parts of the Netherlands', () => {
    const full = featureFor('NLD');
    expect(spanDeg(full)).toBeGreaterThan(70);
    expect(spanDeg(capitalCluster(full, get('NLD').capitalLonLat))).toBeLessThan(10);
  });

  it('keeps genuine archipelagos whole', () => {
    // These countries really are spread out; narrowing them would be wrong.
    for (const code of ['JPN', 'IDN', 'PHL']) {
      const full = featureFor(code);
      const clustered = capitalCluster(full, get(code).capitalLonLat);
      expect(spanDeg(clustered), code).toBeCloseTo(spanDeg(full), 5);
    }
  });

  it('keeps Canada whole, arctic archipelago included', () => {
    const full = featureFor('CAN');
    const clustered = capitalCluster(full, get('CAN').capitalLonLat);
    expect(spanDeg(clustered)).toBeCloseTo(spanDeg(full), 5);
    expect(spanDeg(clustered)).toBeGreaterThan(80);
  });

  it('returns a single-polygon country untouched', () => {
    const f = featureFor('CHE');
    expect(capitalCluster(f, get('CHE').capitalLonLat)).toBe(f);
  });

  it('always keeps the landmass the capital stands on', () => {
    // Whatever else is dropped, the capital must still have its own land.
    //
    // Asserted as a great-circle distance rather than a bounding-box test:
    // Fiji, Kiribati, New Zealand, Russia and the USA all have bounds that
    // wrap the antimeridian, where west > east and a naive lon >= w && lon <= e
    // comparison is meaningless.
    const failures: string[] = [];
    for (const c of countries) {
      const f = atlas.get(c.code);
      if (!f) continue;
      const km = offsetFromOutlineKm(capitalCluster(f, c.capitalLonLat), c.capitalLonLat);
      if (km > 5) failures.push(`${c.code} ${c.capital.en} is ${km.toFixed(1)} km from its cluster`);
    }
    expect(failures).toEqual([]);
  });
});

describe('fitCountry', () => {
  it('produces a non-empty SVG path', () => {
    const { pathD } = fitCountry(featureFor('FRA'), get('FRA').capitalLonLat, box);
    expect(pathD.length).toBeGreaterThan(100);
    expect(pathD.startsWith('M')).toBe(true);
  });

  it('fits the outline inside the box', () => {
    const { bounds } = fitCountry(featureFor('FRA'), get('FRA').capitalLonLat, box);
    const [[x0, y0], [x1, y1]] = bounds;
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(box.width);
    expect(y1).toBeLessThanOrEqual(box.height);
  });

  it('fills most of at least one axis of the box', () => {
    const { bounds } = fitCountry(featureFor('FRA'), get('FRA').capitalLonLat, box);
    const [[x0, y0], [x1, y1]] = bounds;
    const fill = Math.max((x1 - x0) / box.width, (y1 - y0) / box.height);
    expect(fill).toBeGreaterThan(0.8);
  });

  it('places the capital dot inside the country bounds', () => {
    const { dotXY, bounds } = fitCountry(
      featureFor('FRA'),
      get('FRA').capitalLonLat,
      box,
    );
    const [[x0, y0], [x1, y1]] = bounds;
    expect(dotXY[0]).toBeGreaterThanOrEqual(x0);
    expect(dotXY[0]).toBeLessThanOrEqual(x1);
    expect(dotXY[1]).toBeGreaterThanOrEqual(y0);
    expect(dotXY[1]).toBeLessThanOrEqual(y1);
  });

  it('rejects swapped [lat, lon] coordinates by putting the dot far outside', () => {
    // This is the guard for the single most likely bug in the whole codebase.
    // Paris is [2.35, 48.86]. Swapped it becomes [48.86, 2.35] — a point in
    // the Indian Ocean off Somalia, which must not land inside France.
    const paris = get('FRA').capitalLonLat;
    const swapped: [number, number] = [paris[1], paris[0]];
    const { dotXY, bounds } = fitCountry(featureFor('FRA'), swapped, box);
    const [[x0, y0], [x1, y1]] = bounds;
    const inside =
      dotXY[0] >= x0 && dotXY[0] <= x1 && dotXY[1] >= y0 && dotXY[1] <= y1;
    expect(inside).toBe(false);
  });

  it('renders the capital dot inside the visible frame for every country', () => {
    // The universal invariant: whatever the country's shape, the player can
    // always see the marker. Twenty coastal capitals sit just outside their
    // own outline, so this is asserted against the viewport rather than the
    // outline's bounding box.
    const failures: string[] = [];
    for (const c of countries) {
      const f = atlas.get(c.code);
      if (!f) continue;
      const { dotXY } = fitCountry(f, c.capitalLonLat, box);
      const visible =
        dotXY[0] >= 0 &&
        dotXY[0] <= box.width &&
        dotXY[1] >= 0 &&
        dotXY[1] <= box.height;
      if (!visible) {
        failures.push(`${c.code} (${c.capital.en}) at ${dotXY.map(Math.round).join(',')}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('puts the dot on the landmass for countries whose capital is inland', () => {
    // Stricter check, applied where the data supports it: for a capital that
    // genuinely falls inside its outline, the dot must land inside the drawn
    // bounding box, not merely somewhere on screen.
    const failures: string[] = [];
    for (const c of countries) {
      const f = atlas.get(c.code);
      if (!f) continue;
      if (offsetFromOutlineKm(f, c.capitalLonLat) > 0.001) continue;
      const { dotXY, bounds } = fitCountry(f, c.capitalLonLat, box);
      const [[x0, y0], [x1, y1]] = bounds;
      const inside =
        dotXY[0] >= x0 - 1 &&
        dotXY[0] <= x1 + 1 &&
        dotXY[1] >= y0 - 1 &&
        dotXY[1] <= y1 + 1;
      if (!inside) failures.push(`${c.code} (${c.capital.en})`);
    }
    expect(failures).toEqual([]);
  });

  it('handles a tiny country and a huge one without throwing', () => {
    for (const code of ['VAT', 'RUS', 'SGP', 'CAN']) {
      const c = get(code);
      const { pathD } = fitCountry(featureFor(code), c.capitalLonLat, box);
      expect(pathD.length, code).toBeGreaterThan(10);
    }
  });

  it('respects padding', () => {
    const { bounds } = fitCountry(featureFor('FRA'), get('FRA').capitalLonLat, {
      ...box,
      padding: 40,
    });
    const [[x0, y0], [x1, y1]] = bounds;
    expect(x0).toBeGreaterThanOrEqual(39);
    expect(y0).toBeGreaterThanOrEqual(39);
    expect(x1).toBeLessThanOrEqual(box.width - 39);
    expect(y1).toBeLessThanOrEqual(box.height - 39);
  });
});

describe('unproject', () => {
  it('round-trips the capital: pixel back to coordinate', () => {
    // The dot was produced by projecting Paris; inverting it must return Paris.
    // If the projection and its inverse ever disagree, placement scoring is
    // measuring against a phantom.
    const paris = get('FRA').capitalLonLat;
    const { dotXY, unproject } = fitCountry(featureFor('FRA'), paris, box);
    const back = unproject(dotXY[0], dotXY[1]);
    expect(back).not.toBeNull();
    expect(back![0]).toBeCloseTo(paris[0], 4);
    expect(back![1]).toBeCloseTo(paris[1], 4);
  });

  it('round-trips for every country', () => {
    const failures: string[] = [];
    for (const c of countries) {
      const f = atlas.get(c.code);
      if (!f) continue;
      const { dotXY, unproject } = fitCountry(f, c.capitalLonLat, box);
      const back = unproject(dotXY[0], dotXY[1]);
      if (!back) {
        failures.push(`${c.code}: unproject returned null`);
        continue;
      }
      const dLon = Math.abs(back[0] - c.capitalLonLat[0]);
      const dLat = Math.abs(back[1] - c.capitalLonLat[1]);
      if (dLon > 0.01 || dLat > 0.01) {
        failures.push(`${c.code}: off by ${dLon.toFixed(3)}, ${dLat.toFixed(3)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('moves in the expected direction across the frame', () => {
    // Sanity of orientation: further right is further east, further down is
    // further south. A sign error here would score every placement mirrored.
    const { unproject } = fitCountry(featureFor('FRA'), get('FRA').capitalLonLat, box);
    const centre = unproject(box.width / 2, box.height / 2)!;
    const right = unproject(box.width / 2 + 60, box.height / 2)!;
    const below = unproject(box.width / 2, box.height / 2 + 60)!;
    expect(right[0]).toBeGreaterThan(centre[0]);
    expect(below[1]).toBeLessThan(centre[1]);
  });
});

describe('reachKm', () => {
  it('is the distance to the furthest corner of the frame', () => {
    const che = get('CHE');
    const fit = fitCountry(featureFor('CHE'), che.capitalLonLat, box);
    // Switzerland is a few hundred kilometres across, and the frame adds
    // padding around it. Anything near zero or in the thousands is a bug.
    expect(fit.reachKm).toBeGreaterThan(150);
    expect(fit.reachKm).toBeLessThan(500);
  });

  it('grows with the country', () => {
    const reach = (code: string) =>
      fitCountry(featureFor(code), get(code).capitalLonLat, box).reachKm;
    expect(reach('CHE')).toBeLessThan(reach('FRA'));
    expect(reach('FRA')).toBeLessThan(reach('CAN'));
  });

  it('leaves a wild guess punishable on every map worth missing', () => {
    // The regression this exists to catch, and the reason it lives in `geo`
    // rather than `core`: the scoring was calibrated in absolute kilometres
    // while the frame bounds the error. Nothing in `core` knows how much world
    // is on screen, so no unit test there could ever have seen that the miss
    // threshold sat off the edge of the map in 157 of 193 countries.
    const unpunishable: string[] = [];
    const tooSmallToMiss: string[] = [];

    for (const c of countries) {
      const f = atlas.get(c.code);
      if (!f) continue;
      const { reachKm } = fitCountry(f, c.capitalLonLat, box);
      // A frame this small is entirely inside the bullseye allowance: there is
      // no such thing as a wild guess in a two-kilometre-wide country.
      if (reachKm <= PLACE_FULL_KM * 4) {
        tooSmallToMiss.push(c.code);
        continue;
      }
      if (missDistanceFor(reachKm) >= reachKm) unpunishable.push(c.code);
    }

    expect(unpunishable).toEqual([]);
    // Twenty of them, Vatican (2 km across) through Luxembourg (92 km). They
    // are all genuine micro-states, and a drop anywhere in such a frame really
    // is right. The bound is here to notice if a normal country ever joins
    // them, which would mean the fitting broke.
    expect(tooSmallToMiss.length).toBeLessThanOrEqual(22);
  });
});
