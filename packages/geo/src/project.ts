import {
  geoArea,
  geoAzimuthalEqualArea,
  geoCentroid,
  geoContains,
  geoDistance,
  geoPath,
} from 'd3-geo';
import type { GeoGeometryObjects } from 'd3-geo';
import type { Position } from 'geojson';
import type { LonLat } from '@capitales/core';
import type { CountryFeature } from './atlas.js';

export interface Box {
  width: number;
  height: number;
  /** Inset in pixels on all four sides. Default 12. */
  padding?: number;
}

export interface FittedCountry {
  /** SVG path "d" attribute for the country outline. */
  pathD: string;
  /** Pixel position of the capital, in the same space as pathD. */
  dotXY: [number, number];
  /** Pixel bounding box of the outline: [[x0, y0], [x1, y1]]. */
  bounds: [[number, number], [number, number]];
  /**
   * The furthest the player could possibly be wrong, in kilometres.
   *
   * The map shows one country and nothing else, so the frame bounds the error:
   * you cannot drop a marker 2000 km from Paris because 2000 km from Paris is
   * not on screen. Scoring has to be calibrated against this rather than
   * against absolute geography, or the "wild guess" threshold sits off the edge
   * of the map and can never be crossed.
   *
   * The projection is centred on the capital, so pixel distance from the dot
   * rises monotonically with real distance and the furthest frame corner is the
   * furthest reachable point.
   */
  reachKm: number;
  /**
   * The pixel radius of a circle of `km` around the capital.
   *
   * The scoring talks about a target; drawing it is what makes the phrase "on
   * target" mean something to the player. Computed by projecting a point that
   * really is `km` away rather than by scaling a constant: the projection is
   * equal-area, so its radial scale is not linear in distance, and at Russia's
   * size the difference between the two is visible on screen.
   */
  radiusPx: (km: number) => number;
  /**
   * Turns a pixel position in this frame back into [lon, lat].
   *
   * The inverse of the projection that drew the outline, so a click on the map
   * becomes a real coordinate that can be measured against a real capital. It
   * is the same projection instance, which is why the two can never disagree.
   *
   * Returns null for a point that does not correspond to anywhere on the globe
   * — possible near the edge of an azimuthal projection.
   */
  unproject: (x: number, y: number) => LonLat | null;
  /**
   * The forward direction, for drawing a coordinate the game already holds —
   * the player's own marker, replayed from state rather than from the click
   * that produced it.
   */
  project: (lonLat: LonLat) => [number, number] | null;
}

/**
 * Great-circle distance, in degrees, within which two parts of a country are
 * treated as belonging to the same landmass.
 *
 * Tuned against the whole dataset. At 8 degrees this keeps Canada's arctic
 * archipelago, Indonesia's 133 islands, Japan and the Philippines intact,
 * while dropping France's Caribbean and Indian Ocean departments and the
 * Netherlands' Caribbean municipalities. Lowering it to 5 starts chopping
 * Canada; raising it to 12 starts pulling the Galapagos back into Ecuador.
 */
const CLUSTER_LINK_DEG = 8;

/**
 * How far outside its own outline a capital may sit and still be pulled into
 * the viewport.
 *
 * 20 of the 193 capitals fall outside their country's polygon at 50m
 * resolution — Lisbon, Stockholm, Beirut, Nassau, Monaco, Vatican City and
 * other coastal cities — by between 0.3 and 3.8 km. For a large country that
 * is a sub-pixel error, but Vatican City sits 1.2 km outside a country only
 * 1.1 km wide, so its marker would render completely off-frame.
 *
 * The cap is what keeps this honest. Widening the frame to include the capital
 * unconditionally would mean ANY coordinate, including a transposed
 * [lat, lon] pair, gets framed and looks plausible. At 50 km a genuine coastal
 * offset is absorbed while a swapped Paris — 6000 km adrift — is left far
 * outside the frame, where the tests catch it.
 */
const CAPITAL_IN_FRAME_KM = 50;

const EARTH_RADIUS_KM = 6371;

const DEG = Math.PI / 180;

/** Great-circle distance in radians from a point to a polygon's nearest vertex. */
function distanceToPart(
  part: Position[][] | undefined,
  point: LonLat,
): number {
  if (!part) return Infinity;
  let nearest = Infinity;
  for (const ring of part) {
    for (const vertex of ring) {
      const d = geoDistance(point, vertex as [number, number]);
      if (d < nearest) nearest = d;
    }
  }
  return nearest;
}

/**
 * How far OUTSIDE a country a point lies, in kilometres. Zero when the point
 * is within the outline.
 *
 * The containment check is not an optimisation, it is the definition: without
 * it this measures the distance to the nearest boundary vertex, which for a
 * landlocked capital like Ouagadougou is 150 km even though the city is
 * comfortably inside the country.
 *
 * Returns a few km for the coastal capitals the 50m coastline misplaces, and
 * thousands for a transposed [lat, lon] pair.
 */
export function offsetFromOutlineKm(f: CountryFeature, point: LonLat): number {
  if (geoContains(f, point)) return 0;
  let nearest = Infinity;
  for (const part of partsOf(f)) {
    const d = distanceToPart(part, point);
    if (d < nearest) nearest = d;
  }
  return nearest * EARTH_RADIUS_KM;
}

function partsOf(f: CountryFeature): Position[][][] {
  return f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates]
    : f.geometry.coordinates;
}

function featureFromParts(
  parts: Position[][][],
  id: CountryFeature['id'],
): CountryFeature {
  const first = parts[0];
  if (parts.length === 1 && first) {
    return {
      type: 'Feature',
      id,
      properties: {},
      geometry: { type: 'Polygon', coordinates: first },
    };
  }
  return {
    type: 'Feature',
    id,
    properties: {},
    geometry: { type: 'MultiPolygon', coordinates: parts },
  };
}

/**
 * The landmass a country's capital sits on, plus everything chained to it.
 *
 * Natural Earth stores a country's overseas departments in the same feature as
 * its mainland. France spans 118 degrees of longitude that way, so fitting the
 * viewport to the whole feature reduces metropolitan France to a few specks and
 * puts the projection's centre in the Atlantic. Fitting to the capital's
 * cluster instead gives the outline a player would actually recognise.
 *
 * Parts are chained rather than simply distance-filtered from the seed, so a
 * strung-out archipelago like the Ryukyus still connects Okinawa back to
 * Honshu through the islands in between.
 *
 * Returns the input feature unchanged when nothing would be dropped.
 */
export function capitalCluster(
  f: CountryFeature,
  capital: LonLat,
  linkDeg: number = CLUSTER_LINK_DEG,
): CountryFeature {
  const parts = partsOf(f);
  if (parts.length < 2) return f;

  const centroids = parts.map((p) => geoCentroid(featureFromParts([p], f.id)));

  // Seed with the part the capital actually stands on.
  //
  // Nearest-centroid is the tempting shortcut and it is wrong: a large
  // country's centroid can be much further from its capital than a small
  // exclave's is. Moscow is 9.3 degrees from Kaliningrad's centroid but far
  // more than that from the centroid of the main Russian landmass out in
  // Siberia, so nearest-centroid seeds Kaliningrad and renders it as Russia.
  let seed = -1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p && geoContains(featureFromParts([p], f.id), capital)) {
      seed = i;
      break;
    }
  }

  // 20 capitals sit just offshore of their own outline at this resolution.
  // Fall back to the part with a vertex nearest the capital — still the right
  // landmass, unlike its centroid.
  if (seed === -1) {
    let nearest = Infinity;
    for (let i = 0; i < parts.length; i++) {
      const d = distanceToPart(parts[i], capital);
      if (d < nearest) {
        nearest = d;
        seed = i;
      }
    }
    if (seed === -1) seed = 0;
  }

  const chosen = new Set<number>([seed]);
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < parts.length; i++) {
      if (chosen.has(i)) continue;
      const ci = centroids[i];
      if (!ci) continue;
      for (const j of chosen) {
        const cj = centroids[j];
        if (cj && geoDistance(ci, cj) <= linkDeg * DEG) {
          chosen.add(i);
          grew = true;
          break;
        }
      }
    }
  }

  if (chosen.size === parts.length) return f;

  const kept = [...chosen]
    .sort((a, b) => a - b)
    .map((i) => parts[i])
    .filter((p): p is Position[][] => p !== undefined);

  return featureFromParts(kept, f.id);
}

/**
 * Projects one country to fill a box, and its capital to a pixel position.
 *
 * An equal-area projection centred on the country avoids Mercator's distortion,
 * which would render Canada and Greenland absurdly and leak difficulty cues.
 *
 * The outline and the dot go through the SAME projection instance, so they
 * cannot drift out of sync.
 */
export function fitCountry(
  f: CountryFeature,
  capital: LonLat,
  box: Box,
): FittedCountry {
  const pad = box.padding ?? 12;

  // Fit and draw the capital's landmass, not every scattered territory.
  const shape = capitalCluster(f, capital);
  const [lon, lat] = geoCentroid(shape);

  // Widen the frame to include the capital only when it sits just offshore.
  // See CAPITAL_IN_FRAME_KM: the cap is what stops bad coordinates from
  // quietly rescaling the map to make themselves look correct.
  const offsetKm = offsetFromOutlineKm(shape, capital);

  const fitTarget: GeoGeometryObjects =
    offsetKm > 0 && offsetKm <= CAPITAL_IN_FRAME_KM
      ? {
          type: 'GeometryCollection',
          geometries: [shape.geometry, { type: 'Point', coordinates: capital }],
        }
      : shape.geometry;

  // rotate() must be set before fitExtent(): fitExtent computes scale and
  // translate for the already-rotated projection.
  const projection = geoAzimuthalEqualArea()
    .rotate([-lon, -lat])
    .fitExtent(
      [
        [pad, pad],
        [box.width - pad, box.height - pad],
      ],
      fitTarget,
    );

  const pathBuilder = geoPath(projection);
  const pathD = pathBuilder(shape);
  if (!pathD) {
    throw new Error(`empty path for feature ${String(f.id)}`);
  }

  const dot = projection(capital);
  if (!dot) {
    throw new Error(
      `capital ${capital.join(', ')} does not project for ${String(f.id)}`,
    );
  }

  const [[x0, y0], [x1, y1]] = pathBuilder.bounds(shape);

  const radiusKm = Math.sqrt(
    (geoArea(shape) * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / Math.PI,
  );

  // The corners are the furthest points of the frame, and the frame is what
  // bounds a wrong answer. A corner can fail to invert near the edge of an
  // azimuthal projection, so the country's own size is the fallback.
  let reachKm = 0;
  const corners: [number, number][] = [
    [0, 0],
    [box.width, 0],
    [0, box.height],
    [box.width, box.height],
  ];
  for (const [cx, cy] of corners) {
    const corner = projection.invert?.([cx, cy]);
    if (!corner || !Number.isFinite(corner[0]) || !Number.isFinite(corner[1])) {
      continue;
    }
    const d = geoDistance(corner as LonLat, capital) * EARTH_RADIUS_KM;
    if (Number.isFinite(d) && d > reachKm) reachKm = d;
  }
  if (reachKm === 0) reachKm = radiusKm * 2;

  return {
    pathD,
    dotXY: [dot[0], dot[1]],
    reachKm,
    radiusPx: (km) => {
      // The projection is centred on the capital and therefore radially
      // symmetric about it, so any bearing gives the same answer. Due north is
      // the cheapest to write and behaves at the poles like any other.
      const c = km / EARTH_RADIUS_KM;
      const lat1 = lat * DEG;
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(c) + Math.cos(lat1) * Math.sin(c));
      const away = projection([lon, lat2 / DEG]);
      if (!away || !Number.isFinite(away[0]) || !Number.isFinite(away[1])) return 0;
      return Math.hypot(away[0] - dot[0], away[1] - dot[1]);
    },
    bounds: [
      [x0, y0],
      [x1, y1],
    ],
    project: (lonLat) => {
      const p = projection(lonLat);
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
      return [p[0], p[1]];
    },
    unproject: (x, y) => {
      const inverted = projection.invert?.([x, y]);
      if (!inverted) return null;
      const [lon, lat] = inverted;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      return [lon, lat];
    },
  };
}
