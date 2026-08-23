import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type CountryFeature = Feature<Polygon | MultiPolygon>;

/**
 * Turns the committed TopoJSON into a lookup keyed by ADM0_A3.
 *
 * Feature ids are the country codes, set by the ETL. They are NOT ISO numeric
 * ids: Natural Earth uses the sentinel -99 for France and Norway, so an ISO
 * join drops them silently.
 */
export function buildAtlas(topology: Topology): Map<string, CountryFeature> {
  const object = topology.objects['countries'] as GeometryCollection | undefined;
  if (!object) {
    throw new Error('countries.topo.json has no "countries" object');
  }

  const collection = feature(topology, object) as unknown as {
    features: CountryFeature[];
  };

  const byCode = new Map<string, CountryFeature>();
  for (const f of collection.features) {
    if (f.id == null) continue;
    byCode.set(String(f.id), f);
  }
  return byCode;
}
