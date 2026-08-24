/**
 * One-time ETL. Downloads Natural Earth 50m, joins countries to their capitals,
 * and emits the two committed artifacts. Run with: npm run build:data
 *
 * Both outputs are committed, so nothing after this needs the network.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { topology } from 'topojson-server';
import { quantize } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Objects, Topology } from 'topojson-specification';
import type { CountryRecord, LonLat } from '@capitales/core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const CACHE = path.join(PKG, '.cache');

const BASE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const COUNTRIES_SRC = 'ne_50m_admin_0_countries.geojson';
const PLACES_SRC = 'ne_50m_populated_places.geojson';

/**
 * Quantization snaps coordinates to a grid, which is where nearly all the size
 * saving comes from: 1360 KB unquantized down to 640 KB, with every country's
 * geometry still intact.
 *
 * There is deliberately NO simplification step. topojson-simplify prunes
 * vertices whose triangle area falls below a weight, and Vatican City's entire
 * polygon has an area of 1.74e-8 steradians — four orders of magnitude below
 * even a modest 1e-4 weight — so simplifying pruned every one of its vertices
 * and collapsed the ring to a single repeated point. That produced a feature
 * with zero area, which makes fitExtent compute a scale of 0 and geoPath
 * return null. Simplifying only saved a further 9 KB, so the trade was a
 * silently destroyed country for 1.4% of the file.
 */
const QUANTIZE_GRID = 1e5;

const SOVEREIGN_TYPES = new Set(['Country', 'Sovereign country']);

interface Overrides {
  canonicalCapital: Record<string, { capital: string; altCapitals: string[] }>;
  injectCapital: Record<
    string,
    { capital: string; capitalFr: string; lonLat: LonLat }
  >;
  exclude: Record<string, string>;
}

/** One Admin-0 capital point, with the names Natural Earth carries for it. */
interface CapitalPoint {
  name: string;
  nameFr: string;
  lonLat: LonLat;
}

/** Downloads once, then reads from .cache. The cache is gitignored. */
async function fetchCached(file: string): Promise<FeatureCollection> {
  await mkdir(CACHE, { recursive: true });
  const dest = path.join(CACHE, file);
  if (!existsSync(dest)) {
    console.log(`downloading ${file} ...`);
    const res = await fetch(`${BASE}/${file}`);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(await readFile(dest, 'utf8')) as FeatureCollection;
}

function capitalPoints(places: FeatureCollection): Map<string, CapitalPoint[]> {
  const byCode = new Map<string, CapitalPoint[]>();
  for (const f of places.features) {
    const p = f.properties ?? {};
    if (p['FEATURECLA'] !== 'Admin-0 capital') continue;
    if (f.geometry?.type !== 'Point') continue;
    const code = String(p['ADM0_A3']);
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const name = String(p['NAME']);
    const list = byCode.get(code) ?? [];
    // NAME_FR is populated for every Admin-0 capital in the 50m dataset, but
    // fall back rather than emit "undefined" if that ever stops being true.
    list.push({
      name,
      nameFr: p['NAME_FR'] ? String(p['NAME_FR']) : name,
      lonLat: [lon, lat],
    });
    byCode.set(code, list);
  }
  return byCode;
}

async function main(): Promise<void> {
  const [countriesFc, placesFc] = await Promise.all([
    fetchCached(COUNTRIES_SRC),
    fetchCached(PLACES_SRC),
  ]);
  const overrides = JSON.parse(
    await readFile(path.join(PKG, 'overrides.json'), 'utf8'),
  ) as Overrides;

  const caps = capitalPoints(placesFc);
  const countries: CountryRecord[] = [];
  const keptFeatures: Feature<Geometry>[] = [];
  const skippedDependencies: string[] = [];

  for (const f of countriesFc.features) {
    const p = f.properties ?? {};
    const type = String(p['TYPE']);
    if (!SOVEREIGN_TYPES.has(type)) continue;

    const code = String(p['ADM0_A3']);
    if (code in overrides.exclude) continue;

    const found = caps.get(code) ?? [];
    let capital: string;
    let capitalFr: string;
    let capitalLonLat: LonLat;
    let altCapitals: string[] = [];
    let altCapitalsFr: string[] = [];

    if (found.length === 0) {
      const injected = overrides.injectCapital[code];
      if (injected) {
        capital = injected.capital;
        capitalFr = injected.capitalFr;
        capitalLonLat = injected.lonLat;
      } else if (type === 'Sovereign country') {
        // A real country is about to vanish silently. Refuse.
        throw new Error(
          `${code} (${String(p['NAME'])}) is a Sovereign country with no ` +
            `Admin-0 capital and no override. Add it to overrides.json ` +
            `(injectCapital or exclude) and re-run.`,
        );
      } else {
        skippedDependencies.push(`${code} (${String(p['NAME'])})`);
        continue;
      }
    } else if (found.length === 1) {
      const only = found[0] as CapitalPoint;
      capital = only.name;
      capitalFr = only.nameFr;
      capitalLonLat = only.lonLat;
    } else {
      const chosen = overrides.canonicalCapital[code];
      if (!chosen) {
        throw new Error(
          `${code} (${String(p['NAME'])}) has ${found.length} Admin-0 ` +
            `capitals (${found.map((c) => c.name).join(', ')}) and no ` +
            `canonicalCapital override. Pick one in overrides.json and re-run.`,
        );
      }
      const match = found.find((c) => c.name === chosen.capital);
      if (!match) {
        throw new Error(
          `${code}: overrides.json names "${chosen.capital}" but the dataset ` +
            `only has ${found.map((c) => c.name).join(', ')}.`,
        );
      }
      capital = match.name;
      capitalFr = match.nameFr;
      capitalLonLat = match.lonLat;
      altCapitals = chosen.altCapitals;

      // Resolve each alternate's French name from the same dataset rather than
      // duplicating translations into overrides.json. Fails loudly if an
      // override names a city the dataset does not list for this country.
      altCapitalsFr = chosen.altCapitals.map((alt) => {
        const point = found.find((c) => c.name === alt);
        if (!point) {
          throw new Error(
            `${code}: overrides.json lists "${alt}" as an alternate capital, ` +
              `but the dataset only has ${found.map((c) => c.name).join(', ')}.`,
          );
        }
        return point.nameFr;
      });
    }

    const nameEn = String(p['NAME']);
    countries.push({
      code,
      name: { en: nameEn, fr: p['NAME_FR'] ? String(p['NAME_FR']) : nameEn },
      capital: { en: capital, fr: capitalFr },
      altCapitals: { en: altCapitals, fr: altCapitalsFr },
      capitalLonLat,
      continent: String(p['CONTINENT']),
    });
    keptFeatures.push({
      type: 'Feature',
      id: code,
      properties: {},
      geometry: f.geometry,
    });
  }

  countries.sort((a, b) => a.code.localeCompare(b.code));

  // topojson-server returns Topology<Objects<GeoJsonProperties>>, where the
  // properties may be null; topojson-client want Objects<{}>.
  // The features carry no properties at all, so the cast is safe and this is
  // the only place the two libraries' generics have to be reconciled.
  let topo = topology({
    countries: {
      type: 'FeatureCollection',
      features: keptFeatures,
    } as never,
  }) as unknown as Topology<Objects<Record<string, never>>>;

  topo = quantize(topo, QUANTIZE_GRID);

  await writeFile(
    path.join(PKG, 'capitals.json'),
    JSON.stringify(countries, null, 2) + '\n',
  );
  await writeFile(path.join(PKG, 'countries.topo.json'), JSON.stringify(topo));

  const topoBytes = Buffer.byteLength(JSON.stringify(topo));
  console.log(`countries written: ${countries.length}`);
  console.log(`topojson: ${(topoBytes / 1024).toFixed(0)} KB`);
  console.log(
    `skipped ${skippedDependencies.length} dependencies: ` +
      skippedDependencies.join(', '),
  );
}

await main();
