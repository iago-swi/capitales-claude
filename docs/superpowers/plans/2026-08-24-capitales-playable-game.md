# Capitales — Plan 1: Playable Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, tested, playable capital-cities quiz that runs in the browser against a local Firebase emulator, with a persisted leaderboard.

**Architecture:** An npm-workspaces monorepo with a framework-free core. `packages/core` holds pure game logic (RNG, question generation, scoring, a clock-free reducer) and imports nothing from the DOM, Svelte or Firebase. `packages/geo` turns country geometry into SVG path strings via `d3-geo`. `packages/data` owns the Natural Earth ETL, the Firestore seed script, and the Firebase client wrapper. `packages/ui` holds Svelte primitives, and `apps/web` composes them. Later plans add the mobile and Electron shells over the same core without touching it.

**Tech Stack:** TypeScript, Vite, Svelte 5 (runes), Tailwind CSS v4, `d3-geo`, `topojson-client`/`-server`/`-simplify`, Firebase Emulator Suite (Firestore + Auth), `firebase` + `firebase-admin` SDKs, Vitest, `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-08-24-capitales-quiz-design.md`

**Covers spec build-order phases 1–6.** Phases 7–9 (`apps/mobile`, `apps/desktop`, Playwright e2e) are Plan 2, written after this plan lands.

## Global Constraints

- **Node 24, npm 11, Java 25** are the target toolchain. Java is required by the Firebase emulators.
- **Never hand-write dependency version ranges.** Install with `npm install` / `npm install -D` and let npm write the resolved versions into `package.json`. Fabricated version ranges are a plan failure.
- **Firebase project id is `demo-capitales`.** The `demo-` prefix is load-bearing: project ids starting with `demo-` are emulator-only and require no credentials, no real project, and no billing.
- **Emulator ports:** Firestore `8080`, Auth `9099`, Emulator UI `4000`.
- **The country key is `code`**, holding Natural Earth's `ADM0_A3`. Never join on `ISO_A3` or `ISO_N3` — Natural Earth sets both to the sentinel `-99` for `FRA`, `NOR`, `CYN`, `SOL` and `KOS`, so an ISO join loses France and Norway with no error.
- **Coordinates are always `[lon, lat]`**, GeoJSON order, everywhere in this codebase. Natural Earth's `LATITUDE`/`LONGITUDE` properties and most APIs use the opposite order. Convert at the ETL boundary and never again.
- **`packages/core` imports nothing** from `geo`, `data`, `ui`, Svelte, the DOM, or Firebase. A reviewer should reject any task that violates this.
- **The reducer never calls `Date.now()`.** Timestamps arrive on events.
- **Eligible country count is 193.** It lives in `capitals.json` and is asserted in exactly one test; it is hardcoded nowhere in application code.
- **TDD throughout:** write the failing test, run it, watch it fail for the right reason, implement minimally, run it again, commit.

---

### Task 1: Workspace scaffold and a running emulator

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `firebase.json`, `.firebaserc`, `firestore.rules`, `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: the npm workspace roots `packages/*` and `apps/*`; the scripts `npm run emulators` and `npm test`; the Firebase project id `demo-capitales`.

- [ ] **Step 1: Create the root `package.json`**

```json
{
  "name": "capitales",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "emulators": "firebase emulators:start --import ./.emulator-data --export-on-exit",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.base.json --noEmit"
  }
}
```

- [ ] **Step 2: Install the root toolchain**

Let npm resolve every version. Do not edit the version ranges afterwards.

```bash
npm install -D typescript tsx vitest firebase-tools
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"]
}
```

`noUncheckedIndexedAccess` matters here: this codebase indexes into option arrays and country pools constantly, and it forces those accesses to be guarded.

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create the Firebase configuration**

`.firebaserc`:

```json
{ "projects": { "default": "demo-capitales" } }
```

`firebase.json`:

```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

`firestore.rules` — the final rules from spec §5.4, written now because the Admin SDK used for seeding bypasses them anyway:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /countries/{code} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /runs/{runId} {
      allow read: if true;
      allow create: if request.auth != null
                    && request.auth.uid == request.resource.data.uid;
      allow update, delete: if false;
    }
  }
}
```

- [ ] **Step 6: Extend `.gitignore`**

Append these lines to the existing file:

```
.firebase/
*.tsbuildinfo
packages/data/.cache/
```

`packages/data/.cache/` will hold the downloaded Natural Earth source files in Task 3. They are large and re-downloadable, so they stay out of git; the ETL *outputs* are committed.

- [ ] **Step 7: Start the emulator and verify it is reachable**

Run in one terminal:

```bash
npm run emulators
```

Expected: startup logs listing Firestore on `8080`, Auth on `9099`, UI on `4000`. The `--import ./.emulator-data` flag warns that the directory does not exist yet; that is expected on first run and harmless.

In a second terminal, verify something is actually listening:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
```

Expected: a numeric HTTP status (200). A `curl: (7) Failed to connect` means the emulator is not up.

- [ ] **Step 8: Stop the emulator and confirm state was exported**

Press Ctrl-C in the emulator terminal, then:

```bash
ls .emulator-data
```

Expected: a `firebase-export-metadata.json` and at least one export subdirectory. If `.emulator-data` does not exist, `--export-on-exit` did not fire — re-check `firebase.json` before continuing, because every later task depends on persistence working.

- [ ] **Step 9: Write `README.md`**

```markdown
# Capitales

A capital-cities quiz. Shows a country outline with a dot on its capital;
pick the right city from four options.

Remake of a Visual Basic game from ~1996.

## Requirements

Node 24+, npm 11+, Java 21+ (required by the Firebase emulators).

## Running

Two terminals. First:

    npm run emulators

Then, once only, to load the country data:

    npm run seed

Then:

    npm run dev

## Design

See `docs/superpowers/specs/2026-08-24-capitales-quiz-design.md`.
```

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts firebase.json .firebaserc firestore.rules .gitignore README.md
git commit -m "chore: scaffold workspace and firebase emulator config"
```

---

### Task 2: Seeded random number generation

Everything downstream depends on deterministic randomness, so this comes first and is tested hard.

**Files:**
- Create: `packages/core/package.json`, `packages/core/src/index.ts`, `packages/core/src/rng.ts`
- Test: `packages/core/src/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Rng = () => number`
  - `mulberry32(seed: number): Rng`
  - `shuffle<T>(rng: Rng, items: readonly T[]): T[]`
  - `sample<T>(rng: Rng, items: readonly T[], n: number): T[]`

- [ ] **Step 1: Create the package manifest**

`packages/core/package.json`:

```json
{
  "name": "@capitales/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

There is no build step. Vite and Vitest consume the TypeScript source directly through the `exports` field, which is the main reason this monorepo stays simple.

- [ ] **Step 2: Write the failing test**

`packages/core/src/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32, sample, shuffle } from './rng.js';

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 20 }, mulberry32(1));
    const b = Array.from({ length: 20 }, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5]);
    const out = shuffle(mulberry32(3), input);
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a given seed', () => {
    const a = shuffle(mulberry32(9), ['a', 'b', 'c', 'd']);
    const b = shuffle(mulberry32(9), ['a', 'b', 'c', 'd']);
    expect(a).toEqual(b);
  });

  it('actually reorders for at least one seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const reordered = [0, 1, 2, 3, 4].some(
      (s) => shuffle(mulberry32(s), input).join() !== input.join(),
    );
    expect(reordered).toBe(true);
  });
});

describe('sample', () => {
  it('returns n distinct items', () => {
    const out = sample(mulberry32(11), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(4);
  });

  it('returns everything when n exceeds the pool size', () => {
    const out = sample(mulberry32(11), [1, 2, 3], 10);
    expect([...out].sort()).toEqual([1, 2, 3]);
  });

  it('returns an empty array for n <= 0', () => {
    expect(sample(mulberry32(1), [1, 2, 3], 0)).toEqual([]);
    expect(sample(mulberry32(1), [1, 2, 3], -5)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
npx vitest run packages/core/src/rng.test.ts
```

Expected: FAIL — cannot resolve `./rng.js`.

- [ ] **Step 4: Implement**

`packages/core/src/rng.ts`:

```ts
/** A deterministic source of numbers in [0, 1). */
export type Rng = () => number;

/**
 * Mulberry32: a small, fast, well-distributed 32-bit PRNG.
 * Chosen over Math.random because a quiz has to be reproducible in tests.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. Returns a new array; the input is not mutated. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Up to n distinct items, drawn without replacement. */
export function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  if (n <= 0) return [];
  return shuffle(rng, items).slice(0, n);
}
```

- [ ] **Step 5: Create the package entry point**

`packages/core/src/index.ts`:

```ts
export * from './rng.js';
```

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
npx vitest run packages/core/src/rng.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add seeded PRNG with shuffle and sample"
```

---

### Task 3: Natural Earth ETL

Produces the two committed data artifacts. This is the only step that touches the network.

**Files:**
- Create: `packages/data/package.json`, `packages/data/src/build-data.ts`, `packages/data/overrides.json`
- Create (generated, committed): `packages/data/capitals.json`, `packages/data/countries.topo.json`
- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`, root `package.json` (add the `build:data` script)
- Test: `packages/data/src/capitals.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Country { code, name, capital, capitalLonLat, centroid, continent, altCapitals }` exported from `@capitales/core`
  - `packages/data/capitals.json` — a `Country[]` of 193 entries, sorted by `code`
  - `packages/data/countries.topo.json` — TopoJSON, object name `countries`, feature `id` = `code`

- [ ] **Step 1: Define the `Country` type**

`packages/core/src/types.ts`:

```ts
/** A point in GeoJSON order: [longitude, latitude]. Never [lat, lon]. */
export type LonLat = [number, number];

export interface Country {
  /** Natural Earth ADM0_A3. Also the Firestore document id. */
  code: string;
  name: string;
  /** The one answer counted as correct. */
  capital: string;
  capitalLonLat: LonLat;
  /** Precomputed with d3-geo geoCentroid over this country's own geometry. */
  centroid: LonLat;
  continent: string;
  /** Other names also accepted if chosen, e.g. Cape Town for South Africa. */
  altCapitals: string[];
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from './rng.js';
export * from './types.js';
```

- [ ] **Step 2: Create the data package and install its ETL dependencies**

`packages/data/package.json`:

```json
{
  "name": "@capitales/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./capitals.json": "./capitals.json",
    "./countries.topo.json": "./countries.topo.json"
  },
  "dependencies": {
    "@capitales/core": "*"
  }
}
```

Then, from the repository root:

```bash
npm install -w @capitales/data d3-geo topojson-server topojson-simplify topojson-client
npm install -w @capitales/data -D @types/d3-geo @types/topojson-client @types/topojson-specification @types/geojson
```

- [ ] **Step 3: Write `overrides.json`**

Every entry here was produced by inspecting the actual 50m dataset. See spec §5.6.

`packages/data/overrides.json`:

```json
{
  "_comment": "Hand-curated corrections to Natural Earth 50m. See spec section 5.6.",
  "canonicalCapital": {
    "ZAF": {
      "capital": "Pretoria",
      "altCapitals": ["Cape Town", "Bloemfontein"],
      "why": "NE lists four Admin-0 capitals for ZAF including Johannesburg, which is not a capital at all."
    },
    "BOL": {
      "capital": "Sucre",
      "altCapitals": ["La Paz"],
      "why": "Sucre is constitutional, La Paz is the seat of government."
    },
    "CIV": {
      "capital": "Yamoussoukro",
      "altCapitals": ["Abidjan"],
      "why": "Yamoussoukro is official, Abidjan is the economic capital."
    },
    "MMR": {
      "capital": "Naypyidaw",
      "altCapitals": [],
      "why": "Yangon is the former capital and is not accepted."
    }
  },
  "injectCapital": {
    "SDS": {
      "capital": "Juba",
      "lonLat": [31.5825, 4.8517],
      "why": "South Sudan has no Admin-0 capital point in the 50m dataset."
    },
    "NRU": {
      "capital": "Yaren",
      "lonLat": [166.9209, -0.5477],
      "why": "Nauru has no Admin-0 capital point in the 50m dataset."
    }
  },
  "exclude": {
    "CYN": "Northern Cyprus: disputed, recognised only by Turkey."
  }
}
```

- [ ] **Step 4: Write the ETL**

`packages/data/src/build-data.ts`:

```ts
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
import { geoCentroid } from 'd3-geo';
import { topology } from 'topojson-server';
import topojsonSimplify from 'topojson-simplify';
import { quantize } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Country, LonLat } from '@capitales/core';

const { presimplify, simplify } = topojsonSimplify;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const CACHE = path.join(PKG, '.cache');

const BASE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const COUNTRIES_SRC = 'ne_50m_admin_0_countries.geojson';
const PLACES_SRC = 'ne_50m_populated_places.geojson';

/** Simplification weight. Measured: 556 KB output, no country degenerates. */
const SIMPLIFY_WEIGHT = 5e-4;
const QUANTIZE_GRID = 1e5;

const SOVEREIGN_TYPES = new Set(['Country', 'Sovereign country']);

interface Overrides {
  canonicalCapital: Record<string, { capital: string; altCapitals: string[] }>;
  injectCapital: Record<string, { capital: string; lonLat: LonLat }>;
  exclude: Record<string, string>;
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

function capitalPoints(places: FeatureCollection) {
  const byCode = new Map<string, { name: string; lonLat: LonLat }[]>();
  for (const f of places.features) {
    const p = f.properties ?? {};
    if (p['FEATURECLA'] !== 'Admin-0 capital') continue;
    if (f.geometry?.type !== 'Point') continue;
    const code = String(p['ADM0_A3']);
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const list = byCode.get(code) ?? [];
    list.push({ name: String(p['NAME']), lonLat: [lon, lat] });
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
  const countries: Country[] = [];
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
    let capitalLonLat: LonLat;
    let altCapitals: string[] = [];

    if (found.length === 0) {
      const injected = overrides.injectCapital[code];
      if (injected) {
        capital = injected.capital;
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
      const only = found[0] as { name: string; lonLat: LonLat };
      capital = only.name;
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
      capitalLonLat = match.lonLat;
      altCapitals = chosen.altCapitals;
    }

    const [cLon, cLat] = geoCentroid(f as Feature);
    countries.push({
      code,
      name: String(p['NAME']),
      capital,
      capitalLonLat,
      centroid: [cLon, cLat],
      continent: String(p['CONTINENT']),
      altCapitals,
    });
    keptFeatures.push({
      type: 'Feature',
      id: code,
      properties: {},
      geometry: f.geometry,
    });
  }

  countries.sort((a, b) => a.code.localeCompare(b.code));

  let topo = topology({
    countries: { type: 'FeatureCollection', features: keptFeatures } as never,
  });
  topo = simplify(presimplify(topo), SIMPLIFY_WEIGHT);
  topo = quantize(topo, QUANTIZE_GRID);

  await writeFile(
    path.join(PKG, 'capitals.json'),
    JSON.stringify(countries, null, 2) + '\n',
  );
  await writeFile(
    path.join(PKG, 'countries.topo.json'),
    JSON.stringify(topo),
  );

  const topoBytes = Buffer.byteLength(JSON.stringify(topo));
  console.log(`countries written: ${countries.length}`);
  console.log(`topojson: ${(topoBytes / 1024).toFixed(0)} KB`);
  console.log(
    `skipped ${skippedDependencies.length} dependencies: ` +
      skippedDependencies.join(', '),
  );
}

await main();
```

- [ ] **Step 5: Add the script and run the ETL**

Add to the root `package.json` scripts:

```json
"build:data": "tsx packages/data/src/build-data.ts"
```

Run it:

```bash
npm run build:data
```

Expected output:

```
countries written: 193
topojson: 556 KB
skipped 10 dependencies: ABW (Aruba), ALD (Åland), CUW (Curaçao), GGY (Guernsey), GRL (Greenland), HKG (Hong Kong), IMN (Isle of Man), JEY (Jersey), MAC (Macao), SXM (Sint Maarten)
```

The exact ordering of the skipped list follows the dataset's feature order and does not matter. If the count is not 193, do not proceed — the join is wrong. If the ETL throws, it has found a data anomaly that a human must resolve in `overrides.json`; that is the intended behaviour, not a bug.

- [ ] **Step 6: Write the data validation test**

`packages/data/src/capitals.test.ts`:

```ts
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

  it('keeps every coordinate in range and in [lon, lat] order', () => {
    for (const c of countries) {
      for (const [lon, lat] of [c.capitalLonLat, c.centroid]) {
        expect(lon, `${c.code} lon`).toBeGreaterThanOrEqual(-180);
        expect(lon, `${c.code} lon`).toBeLessThanOrEqual(180);
        expect(lat, `${c.code} lat`).toBeGreaterThanOrEqual(-90);
        expect(lat, `${c.code} lat`).toBeLessThanOrEqual(90);
      }
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
      'Africa', 'Asia', 'Europe', 'North America',
      'South America', 'Oceania', 'Seven seas (open ocean)',
    ]);
    for (const c of countries) {
      expect(known.has(c.continent), `${c.code}: ${c.continent}`).toBe(true);
    }
  });
});
```

- [ ] **Step 7: Run the tests**

```bash
npx vitest run packages/data/src/capitals.test.ts
```

Expected: PASS, 12 tests. If `assigns every country a known continent` fails, add the reported continent value to the set — do not delete the test.

- [ ] **Step 8: Commit, including the generated artifacts**

The outputs are committed on purpose: it makes every later build and test run offline and reproducible.

```bash
git add packages/data packages/core/src/types.ts packages/core/src/index.ts package.json package-lock.json
git commit -m "feat(data): add Natural Earth 50m ETL producing 193 countries"
```

---

### Task 4: Seed the emulator

**Files:**
- Create: `packages/data/src/seed.ts`
- Modify: root `package.json` (add the `seed` script)

**Interfaces:**
- Consumes: `packages/data/capitals.json`.
- Produces: a populated `countries` collection in the Firestore emulator; the `npm run seed` script.

- [ ] **Step 1: Install the Admin SDK**

```bash
npm install -w @capitales/data firebase-admin
```

- [ ] **Step 2: Write the seed script**

`packages/data/src/seed.ts`:

```ts
/**
 * Loads capitals.json into the Firestore emulator. Idempotent.
 * Requires `npm run emulators` to already be running.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Country } from '@capitales/core';

const PROJECT_ID = 'demo-capitales';
const FIRESTORE_HOST = '127.0.0.1:8080';

// Must be set before firebase-admin is loaded, which is why this is a dynamic
// import: static ESM imports are hoisted above ordinary statements.
process.env['FIRESTORE_EMULATOR_HOST'] = FIRESTORE_HOST;
process.env['GCLOUD_PROJECT'] = PROJECT_ID;

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const capitalsPath = path.resolve(HERE, '..', 'capitals.json');

async function main(): Promise<void> {
  const countries = JSON.parse(
    await readFile(capitalsPath, 'utf8'),
  ) as Country[];

  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  // Firestore caps a batch at 500 writes.
  const CHUNK = 400;
  for (let i = 0; i < countries.length; i += CHUNK) {
    const batch = db.batch();
    for (const c of countries.slice(i, i + CHUNK)) {
      batch.set(db.collection('countries').doc(c.code), c);
    }
    await batch.commit();
  }

  const after = await db.collection('countries').count().get();
  console.log(`seeded ${countries.length}, collection now holds ${after.data().count}`);
}

await main();
process.exit(0);
```

The `process.exit(0)` is deliberate: the Admin SDK keeps a gRPC channel open and the script would otherwise hang after finishing.

- [ ] **Step 3: Add the script**

Add to the root `package.json` scripts:

```json
"seed": "tsx packages/data/src/seed.ts"
```

- [ ] **Step 4: Run it against a live emulator**

With `npm run emulators` running in another terminal:

```bash
npm run seed
```

Expected: `seeded 193, collection now holds 193`.

If it hangs instead, the emulator is not running — the Admin SDK retries silently, which is the same failure mode the app guards against in Task 10.

- [ ] **Step 5: Verify in the Emulator UI**

Open http://127.0.0.1:4000/firestore and confirm the `countries` collection lists 193 documents, and that `FRA` has `capital: "Paris"` and `capitalLonLat` with longitude ≈ 2.35 first.

- [ ] **Step 6: Confirm idempotency**

Run `npm run seed` a second time. Expected: the same `193` count, not 386.

- [ ] **Step 7: Commit**

```bash
git add packages/data package.json package-lock.json
git commit -m "feat(data): add idempotent emulator seed script"
```

---

### Task 5: Atlas — load geometry and look it up by code

**Files:**
- Create: `packages/geo/package.json`, `packages/geo/src/index.ts`, `packages/geo/src/atlas.ts`
- Test: `packages/geo/src/atlas.test.ts`

**Interfaces:**
- Consumes: `packages/data/countries.topo.json`.
- Produces:
  - `type CountryFeature = Feature<Polygon | MultiPolygon>`
  - `buildAtlas(topology: Topology): Map<string, CountryFeature>`

- [ ] **Step 1: Create the package**

`packages/geo/package.json`:

```json
{
  "name": "@capitales/geo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@capitales/core": "*"
  }
}
```

```bash
npm install -w @capitales/geo d3-geo topojson-client
npm install -w @capitales/geo -D @types/d3-geo @types/topojson-client @types/topojson-specification @types/geojson
```

- [ ] **Step 2: Write the failing test**

`packages/geo/src/atlas.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
npx vitest run packages/geo/src/atlas.test.ts
```

Expected: FAIL — cannot resolve `./atlas.js`.

- [ ] **Step 4: Implement**

`packages/geo/src/atlas.ts`:

```ts
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
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
```

- [ ] **Step 5: Create the entry point**

`packages/geo/src/index.ts`:

```ts
export * from './atlas.js';
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run packages/geo/src/atlas.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/geo package.json package-lock.json
git commit -m "feat(geo): load TopoJSON and index countries by code"
```

---

### Task 6: Projection — country outline and capital dot

The highest-risk component in the plan. The final test here is the one that catches a coordinate-order bug.

**Files:**
- Create: `packages/geo/src/project.ts`
- Modify: `packages/geo/src/index.ts`
- Test: `packages/geo/src/project.test.ts`

**Interfaces:**
- Consumes: `CountryFeature` from `./atlas.js`, `LonLat` from `@capitales/core`.
- Produces:
  - `interface Box { width: number; height: number; padding?: number }`
  - `interface FittedCountry { pathD: string; dotXY: [number, number]; bounds: [[number, number], [number, number]] }`
  - `fitCountry(f: CountryFeature, capital: LonLat, box: Box): FittedCountry`

- [ ] **Step 1: Write the failing test**

`packages/geo/src/project.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Topology } from 'topojson-specification';
import type { Country } from '@capitales/core';
import topo from '../../data/countries.topo.json' with { type: 'json' };
import capitals from '../../data/capitals.json' with { type: 'json' };
import { buildAtlas } from './atlas.js';
import { fitCountry } from './project.js';

const atlas = buildAtlas(topo as unknown as Topology);
const countries = capitals as Country[];
const box = { width: 600, height: 400 };

function get(code: string): Country {
  const c = countries.find((x) => x.code === code);
  if (!c) throw new Error(`missing test fixture ${code}`);
  return c;
}

function featureFor(code: string) {
  const f = atlas.get(code);
  if (!f) throw new Error(`missing geometry ${code}`);
  return f;
}

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

  it('places the capital dot inside the bounds for every country', () => {
    const failures: string[] = [];
    for (const c of countries) {
      const f = atlas.get(c.code);
      if (!f) continue;
      const { dotXY, bounds } = fitCountry(f, c.capitalLonLat, box);
      const [[x0, y0], [x1, y1]] = bounds;
      const pad = 2; // tolerance for coastal capitals on simplified outlines
      const inside =
        dotXY[0] >= x0 - pad && dotXY[0] <= x1 + pad &&
        dotXY[1] >= y0 - pad && dotXY[1] <= y1 + pad;
      if (!inside) failures.push(`${c.code} (${c.capital})`);
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
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run packages/geo/src/project.test.ts
```

Expected: FAIL — cannot resolve `./project.js`.

- [ ] **Step 3: Implement**

`packages/geo/src/project.ts`:

```ts
import { geoAzimuthalEqualArea, geoCentroid, geoPath } from 'd3-geo';
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
  const [lon, lat] = geoCentroid(f);

  // rotate() must be set before fitExtent(): fitExtent computes scale and
  // translate for the already-rotated projection.
  const projection = geoAzimuthalEqualArea()
    .rotate([-lon, -lat])
    .fitExtent(
      [
        [pad, pad],
        [box.width - pad, box.height - pad],
      ],
      f,
    );

  const pathBuilder = geoPath(projection);
  const pathD = pathBuilder(f);
  if (!pathD) {
    throw new Error(`empty path for feature ${String(f.id)}`);
  }

  const dot = projection(capital);
  if (!dot) {
    throw new Error(
      `capital ${capital.join(', ')} does not project for ${String(f.id)}`,
    );
  }

  const [[x0, y0], [x1, y1]] = pathBuilder.bounds(f);

  return {
    pathD,
    dotXY: [dot[0], dot[1]],
    bounds: [
      [x0, y0],
      [x1, y1],
    ],
  };
}
```

- [ ] **Step 4: Export it**

`packages/geo/src/index.ts`:

```ts
export * from './atlas.js';
export * from './project.js';
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run packages/geo/src/project.test.ts
```

Expected: PASS, 8 tests.

If `places the capital dot inside the bounds for every country` reports failures, do **not** widen `pad` to make it green. Investigate each named country first: a genuine coastal capital on a simplified outline may sit a pixel or two outside, but a country whose dot is hundreds of pixels away has a data bug in `capitals.json`.

- [ ] **Step 6: Commit**

```bash
git add packages/geo
git commit -m "feat(geo): project country outlines and capital dots to a box"
```

---

### Task 7: Scoring

**Files:**
- Create: `packages/core/src/scoring.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/scoring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const QUESTION_MS = 15000`
  - `const MAX_MULTIPLIER = 2`
  - `multiplierFor(streak: number): number`
  - `scoreAnswer(correct: boolean, remainingMs: number, streak: number, totalMs?: number): number`

- [ ] **Step 1: Write the failing test**

`packages/core/src/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { multiplierFor, QUESTION_MS, scoreAnswer } from './scoring.js';

describe('multiplierFor', () => {
  it('starts at 1 for the first correct answer', () => {
    expect(multiplierFor(1)).toBe(1);
  });

  it('steps up by 0.25 per consecutive correct answer', () => {
    expect(multiplierFor(2)).toBe(1.25);
    expect(multiplierFor(3)).toBe(1.5);
    expect(multiplierFor(4)).toBe(1.75);
  });

  it('caps at 2 from the fifth onward', () => {
    expect(multiplierFor(5)).toBe(2);
    expect(multiplierFor(9)).toBe(2);
    expect(multiplierFor(100)).toBe(2);
  });

  it('never drops below 1, even for a zero or negative streak', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(-3)).toBe(1);
  });
});

describe('scoreAnswer', () => {
  it('scores 0 for a wrong answer regardless of speed or streak', () => {
    expect(scoreAnswer(false, QUESTION_MS, 5)).toBe(0);
    expect(scoreAnswer(false, 0, 1)).toBe(0);
  });

  it('scores 200 for an instant first correct answer', () => {
    expect(scoreAnswer(true, QUESTION_MS, 1)).toBe(200);
  });

  it('scores 100 for a correct answer at the buzzer', () => {
    expect(scoreAnswer(true, 0, 1)).toBe(100);
  });

  it('scores 150 for a correct answer at the halfway point', () => {
    expect(scoreAnswer(true, QUESTION_MS / 2, 1)).toBe(150);
  });

  it('applies the streak multiplier to base and bonus together', () => {
    // (100 + 100) * 1.25
    expect(scoreAnswer(true, QUESTION_MS, 2)).toBe(250);
    // (100 + 0) * 2
    expect(scoreAnswer(true, 0, 5)).toBe(200);
    // (100 + 100) * 2 — the maximum a single question can be worth
    expect(scoreAnswer(true, QUESTION_MS, 5)).toBe(400);
  });

  it('clamps remaining time that is out of range', () => {
    expect(scoreAnswer(true, -500, 1)).toBe(100);
    expect(scoreAnswer(true, QUESTION_MS * 3, 1)).toBe(200);
  });

  it('returns whole numbers', () => {
    for (let ms = 0; ms <= QUESTION_MS; ms += 137) {
      for (let streak = 1; streak <= 6; streak++) {
        expect(Number.isInteger(scoreAnswer(true, ms, streak))).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run packages/core/src/scoring.test.ts
```

Expected: FAIL — cannot resolve `./scoring.js`.

- [ ] **Step 3: Implement**

`packages/core/src/scoring.ts`:

```ts
/** Countdown per question, in milliseconds. */
export const QUESTION_MS = 15_000;

/** Points awarded for a correct answer before speed and streak. */
export const BASE_POINTS = 100;

/** Maximum points from answering quickly. */
export const MAX_SPEED_BONUS = 100;

/** Ceiling on the streak multiplier. */
export const MAX_MULTIPLIER = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Multiplier for a streak of consecutive correct answers, counting the current
 * one. The first correct answer of a streak has streak === 1 and multiplier 1.
 */
export function multiplierFor(streak: number): number {
  return clamp(1 + 0.25 * (streak - 1), 1, MAX_MULTIPLIER);
}

/**
 * Points for one answer.
 *
 * A wrong answer or a timeout scores 0. A correct answer scores
 * (base + speed bonus) * streak multiplier, rounded once, here.
 */
export function scoreAnswer(
  correct: boolean,
  remainingMs: number,
  streak: number,
  totalMs: number = QUESTION_MS,
): number {
  if (!correct) return 0;
  const remaining = clamp(remainingMs, 0, totalMs);
  const speedBonus = (MAX_SPEED_BONUS * remaining) / totalMs;
  return Math.round((BASE_POINTS + speedBonus) * multiplierFor(streak));
}
```

- [ ] **Step 4: Export it**

`packages/core/src/index.ts`:

```ts
export * from './rng.js';
export * from './types.js';
export * from './scoring.js';
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run packages/core/src/scoring.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add speed and streak scoring"
```

---

### Task 8: Question generation

**Files:**
- Create: `packages/core/src/questions.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/questions.test.ts`

**Interfaces:**
- Consumes: `Country` from `./types.js`, `Rng`/`mulberry32`/`sample`/`shuffle` from `./rng.js`.
- Produces:
  - `const OPTION_COUNT = 4`
  - `interface Question { country: Country; options: string[]; correctIndex: number }`
  - `buildQuestion(country: Country, pool: readonly Country[], rng: Rng): Question`
  - `buildRun(pool: readonly Country[], count: number, rng: Rng): Question[]`
  - `isCorrect(question: Question, chosen: string): boolean`

- [ ] **Step 1: Write the failing test**

`packages/core/src/questions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Country } from './types.js';
import { mulberry32 } from './rng.js';
import { buildQuestion, buildRun, isCorrect, OPTION_COUNT } from './questions.js';

function country(
  code: string,
  capital: string,
  continent: string,
  altCapitals: string[] = [],
): Country {
  return {
    code,
    name: code,
    capital,
    capitalLonLat: [0, 0],
    centroid: [0, 0],
    continent,
    altCapitals,
  };
}

const europe = [
  country('FRA', 'Paris', 'Europe'),
  country('DEU', 'Berlin', 'Europe'),
  country('ESP', 'Madrid', 'Europe'),
  country('ITA', 'Rome', 'Europe'),
  country('PRT', 'Lisbon', 'Europe'),
  country('AUT', 'Vienna', 'Europe'),
];
const asia = [
  country('JPN', 'Tokyo', 'Asia'),
  country('KOR', 'Seoul', 'Asia'),
  country('THA', 'Bangkok', 'Asia'),
];
const pool = [...europe, ...asia];

describe('buildQuestion', () => {
  it('offers exactly four options', () => {
    const q = buildQuestion(europe[0]!, pool, mulberry32(1));
    expect(q.options).toHaveLength(OPTION_COUNT);
  });

  it('includes the correct capital at correctIndex', () => {
    const q = buildQuestion(europe[0]!, pool, mulberry32(1));
    expect(q.options[q.correctIndex]).toBe('Paris');
  });

  it('never repeats an option', () => {
    for (let seed = 0; seed < 50; seed++) {
      const q = buildQuestion(europe[0]!, pool, mulberry32(seed));
      expect(new Set(q.options).size).toBe(OPTION_COUNT);
    }
  });

  it('prefers distractors from the same continent', () => {
    for (let seed = 0; seed < 50; seed++) {
      const q = buildQuestion(europe[0]!, pool, mulberry32(seed));
      const asianCapitals = asia.map((c) => c.capital);
      const leaked = q.options.filter((o) => asianCapitals.includes(o));
      expect(leaked, `seed ${seed}`).toHaveLength(0);
    }
  });

  it('falls back to other continents when the continent is too small', () => {
    const tiny = [
      country('AAA', 'Alpha', 'Tinyland'),
      ...asia,
      ...europe,
    ];
    const q = buildQuestion(tiny[0]!, tiny, mulberry32(4));
    expect(q.options).toHaveLength(OPTION_COUNT);
    expect(q.options).toContain('Alpha');
    expect(new Set(q.options).size).toBe(OPTION_COUNT);
  });

  it('never uses an alternate capital of the same country as a distractor', () => {
    const zaf = country('ZAF', 'Pretoria', 'Africa', ['Cape Town']);
    const africa = [
      zaf,
      country('KEN', 'Nairobi', 'Africa'),
      country('EGY', 'Cairo', 'Africa'),
      country('GHA', 'Accra', 'Africa'),
      country('MAR', 'Rabat', 'Africa'),
    ];
    for (let seed = 0; seed < 30; seed++) {
      const q = buildQuestion(zaf, africa, mulberry32(seed));
      expect(q.options, `seed ${seed}`).not.toContain('Cape Town');
    }
  });

  it('is deterministic for a given seed', () => {
    const a = buildQuestion(europe[0]!, pool, mulberry32(77));
    const b = buildQuestion(europe[0]!, pool, mulberry32(77));
    expect(a.options).toEqual(b.options);
    expect(a.correctIndex).toBe(b.correctIndex);
  });

  it('varies the correct option position across seeds', () => {
    const positions = new Set(
      Array.from({ length: 40 }, (_, s) =>
        buildQuestion(europe[0]!, pool, mulberry32(s)).correctIndex,
      ),
    );
    expect(positions.size).toBeGreaterThan(1);
  });

  it('throws when the pool is too small to fill four options', () => {
    expect(() =>
      buildQuestion(europe[0]!, [europe[0]!, europe[1]!], mulberry32(1)),
    ).toThrow(/at least/i);
  });
});

describe('buildRun', () => {
  it('returns the requested number of questions', () => {
    expect(buildRun(pool, 5, mulberry32(2))).toHaveLength(5);
  });

  it('never asks about the same country twice', () => {
    const codes = buildRun(pool, 9, mulberry32(2)).map((q) => q.country.code);
    expect(new Set(codes).size).toBe(9);
  });

  it('is deterministic for a given seed', () => {
    const a = buildRun(pool, 5, mulberry32(31)).map((q) => q.country.code);
    const b = buildRun(pool, 5, mulberry32(31)).map((q) => q.country.code);
    expect(a).toEqual(b);
  });

  it('differs across seeds', () => {
    const a = buildRun(pool, 5, mulberry32(1)).map((q) => q.country.code);
    const b = buildRun(pool, 5, mulberry32(2)).map((q) => q.country.code);
    expect(a).not.toEqual(b);
  });

  it('throws when asked for more questions than the pool has countries', () => {
    expect(() => buildRun(pool, 99, mulberry32(1))).toThrow(/only \d+/i);
  });
});

describe('isCorrect', () => {
  const zaf = country('ZAF', 'Pretoria', 'Africa', ['Cape Town']);
  const q = buildQuestion(
    zaf,
    [zaf, ...europe],
    mulberry32(5),
  );

  it('accepts the canonical capital', () => {
    expect(isCorrect(q, 'Pretoria')).toBe(true);
  });

  it('accepts a listed alternate capital', () => {
    expect(isCorrect(q, 'Cape Town')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCorrect(q, 'Johannesburg')).toBe(false);
    expect(isCorrect(q, 'Paris')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run packages/core/src/questions.test.ts
```

Expected: FAIL — cannot resolve `./questions.js`.

- [ ] **Step 3: Implement**

`packages/core/src/questions.ts`:

```ts
import type { Rng } from './rng.js';
import { sample, shuffle } from './rng.js';
import type { Country } from './types.js';

export const OPTION_COUNT = 4;

export interface Question {
  country: Country;
  /** Four capital names, shuffled. */
  options: string[];
  /** Index into options of the canonical correct answer. */
  correctIndex: number;
}

/**
 * Builds one question.
 *
 * Distractors come from the same continent where possible. That is a deliberate
 * difficulty choice: "Paris / Berlin / Madrid / Rome" is a real question, while
 * "Paris / Ulaanbaatar / Suva / Asuncion" gives the answer away.
 */
export function buildQuestion(
  country: Country,
  pool: readonly Country[],
  rng: Rng,
): Question {
  // A country's own alternate capitals must never appear as a wrong answer.
  const forbidden = new Set([country.capital, ...country.altCapitals]);

  const eligible = pool.filter(
    (c) => c.code !== country.code && !forbidden.has(c.capital),
  );

  const sameContinent = eligible.filter(
    (c) => c.continent === country.continent,
  );

  const needed = OPTION_COUNT - 1;
  const distractors = sample(rng, sameContinent, needed);

  if (distractors.length < needed) {
    const taken = new Set(distractors.map((c) => c.code));
    const rest = eligible.filter((c) => !taken.has(c.code));
    distractors.push(...sample(rng, rest, needed - distractors.length));
  }

  if (distractors.length < needed) {
    throw new Error(
      `pool must contain at least ${OPTION_COUNT} countries with distinct ` +
        `capitals; got ${distractors.length + 1} usable for ${country.code}`,
    );
  }

  const options = shuffle(rng, [
    country.capital,
    ...distractors.map((c) => c.capital),
  ]);

  return {
    country,
    options,
    correctIndex: options.indexOf(country.capital),
  };
}

/** Builds a full run of `count` questions about distinct countries. */
export function buildRun(
  pool: readonly Country[],
  count: number,
  rng: Rng,
): Question[] {
  if (count > pool.length) {
    throw new Error(
      `asked for ${count} questions but the pool has only ${pool.length} countries`,
    );
  }
  return sample(rng, pool, count).map((c) => buildQuestion(c, pool, rng));
}

/**
 * Whether a chosen city counts as correct. Accepts the canonical capital and
 * any alternate the data marks acceptable, e.g. Cape Town for South Africa.
 */
export function isCorrect(question: Question, chosen: string): boolean {
  return (
    chosen === question.country.capital ||
    question.country.altCapitals.includes(chosen)
  );
}
```

- [ ] **Step 4: Export it**

`packages/core/src/index.ts`:

```ts
export * from './rng.js';
export * from './types.js';
export * from './scoring.js';
export * from './questions.js';
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run packages/core/src/questions.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): generate questions with same-continent distractors"
```

---

### Task 9: The game reducer

**Files:**
- Create: `packages/core/src/game.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/game.test.ts`

**Interfaces:**
- Consumes: `Question`/`isCorrect` from `./questions.js`, `scoreAnswer`/`QUESTION_MS` from `./scoring.js`.
- Produces:
  - `type Phase`, `interface AnswerRecord`, `interface GameState`, `type GameEvent`
  - `initialState(): GameState`
  - `reduce(state: GameState, event: GameEvent): GameState`
  - `remainingMs(state: GameState, now: number): number`

- [ ] **Step 1: Write the failing test**

`packages/core/src/game.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Country } from './types.js';
import { mulberry32 } from './rng.js';
import { buildRun } from './questions.js';
import { QUESTION_MS } from './scoring.js';
import { initialState, reduce, remainingMs } from './game.js';
import type { GameState } from './game.js';

function country(code: string, capital: string): Country {
  return {
    code,
    name: code,
    capital,
    capitalLonLat: [0, 0],
    centroid: [0, 0],
    continent: 'Europe',
    altCapitals: [],
  };
}

const pool = [
  country('FRA', 'Paris'),
  country('DEU', 'Berlin'),
  country('ESP', 'Madrid'),
  country('ITA', 'Rome'),
  country('PRT', 'Lisbon'),
  country('AUT', 'Vienna'),
];

const T0 = 1_000_000;

function started(count = 3): GameState {
  const questions = buildRun(pool, count, mulberry32(1));
  let s = reduce(initialState(), { type: 'LOADED', questions });
  return reduce(s, { type: 'START', now: T0 });
}

/** Answers the current question correctly at `now`. */
function answerCorrectly(s: GameState, now: number): GameState {
  const q = s.questions[s.index]!;
  return reduce(s, { type: 'ANSWER', optionIndex: q.correctIndex, now });
}

/** Answers the current question wrongly at `now`. */
function answerWrongly(s: GameState, now: number): GameState {
  const q = s.questions[s.index]!;
  const wrong = q.options.findIndex((_, i) => i !== q.correctIndex);
  return reduce(s, { type: 'ANSWER', optionIndex: wrong, now });
}

describe('initialState', () => {
  it('starts idle with a zero score', () => {
    const s = initialState();
    expect(s.phase).toBe('idle');
    expect(s.score).toBe(0);
    expect(s.questions).toEqual([]);
  });
});

describe('reduce', () => {
  it('moves idle -> loading -> ready -> question', () => {
    let s = reduce(initialState(), { type: 'LOAD' });
    expect(s.phase).toBe('loading');
    s = reduce(s, { type: 'LOADED', questions: buildRun(pool, 3, mulberry32(1)) });
    expect(s.phase).toBe('ready');
    s = reduce(s, { type: 'START', now: T0 });
    expect(s.phase).toBe('question');
    expect(s.index).toBe(0);
    expect(s.questionStartedAt).toBe(T0);
  });

  it('scores a correct answer and enters revealing', () => {
    const s = answerCorrectly(started(), T0);
    expect(s.phase).toBe('revealing');
    expect(s.score).toBe(200); // instant, first of streak
    expect(s.streak).toBe(1);
    expect(s.correctCount).toBe(1);
  });

  it('scores 0 for a wrong answer and resets the streak', () => {
    let s = answerCorrectly(started(), T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 2000 });
    const before = s.score;
    s = answerWrongly(s, T0 + 2000);
    expect(s.score).toBe(before);
    expect(s.streak).toBe(0);
    expect(s.correctCount).toBe(1);
  });

  it('treats a timeout as a wrong answer', () => {
    const s = reduce(started(), { type: 'TIMEOUT', now: T0 + QUESTION_MS });
    expect(s.phase).toBe('revealing');
    expect(s.score).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.chosenIndex).toBeNull();
    expect(s.answers[0]?.correct).toBe(false);
  });

  it('advances to the next question on REVEAL_DONE', () => {
    let s = answerCorrectly(started(), T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1200 });
    expect(s.phase).toBe('question');
    expect(s.index).toBe(1);
    expect(s.questionStartedAt).toBe(T0 + 1200);
    expect(s.chosenIndex).toBeNull();
  });

  it('finishes after the last question', () => {
    let s = started(2);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    s = answerCorrectly(s, T0 + 1000);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 2000 });
    expect(s.phase).toBe('finished');
    expect(s.index).toBe(1);
    expect(s.answers).toHaveLength(2);
  });

  it('tracks the best streak even after it breaks', () => {
    let s = started(3);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    s = answerCorrectly(s, T0 + 1000);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 2000 });
    expect(s.bestStreak).toBe(2);
    s = answerWrongly(s, T0 + 2000);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
  });

  it('records elapsed milliseconds per answer', () => {
    const s = answerCorrectly(started(), T0 + 4321);
    expect(s.answers[0]?.ms).toBe(4321);
  });

  it('ignores a second answer to the same question', () => {
    let s = answerCorrectly(started(), T0);
    const after = s.score;
    s = answerCorrectly(s, T0);
    expect(s.score).toBe(after);
    expect(s.answers).toHaveLength(1);
  });

  it('ignores ANSWER outside the question phase', () => {
    const s = reduce(initialState(), { type: 'ANSWER', optionIndex: 0, now: T0 });
    expect(s.phase).toBe('idle');
    expect(s.answers).toHaveLength(0);
  });

  it('moves finished -> submitting -> leaderboard', () => {
    let s = started(1);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    expect(s.phase).toBe('finished');
    s = reduce(s, { type: 'SUBMIT' });
    expect(s.phase).toBe('submitting');
    s = reduce(s, { type: 'SUBMIT_OK' });
    expect(s.phase).toBe('leaderboard');
  });

  it('returns to finished with an error when submitting fails', () => {
    let s = started(1);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    s = reduce(s, { type: 'SUBMIT' });
    s = reduce(s, { type: 'SUBMIT_FAILED', reason: 'offline' });
    // The score must survive a failed write.
    expect(s.phase).toBe('finished');
    expect(s.error).toBe('offline');
    expect(s.score).toBe(200);
  });

  it('clears the error on a retry', () => {
    let s = started(1);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    s = reduce(s, { type: 'SUBMIT' });
    s = reduce(s, { type: 'SUBMIT_FAILED', reason: 'offline' });
    s = reduce(s, { type: 'SUBMIT' });
    expect(s.error).toBeNull();
  });

  it('enters the error phase on FAIL', () => {
    const s = reduce(initialState(), { type: 'FAIL', reason: 'no emulator' });
    expect(s.phase).toBe('error');
    expect(s.error).toBe('no emulator');
  });

  it('resets to idle on RESTART', () => {
    let s = answerCorrectly(started(), T0);
    s = reduce(s, { type: 'RESTART' });
    expect(s).toEqual(initialState());
  });

  it('never mutates the state it is given', () => {
    const before = started();
    const snapshot = structuredClone(before);
    answerCorrectly(before, T0);
    expect(before).toEqual(snapshot);
  });

  it('never reads the clock itself', () => {
    // Two reducers fed identical events must agree, whatever the wall clock did.
    const a = answerCorrectly(started(), T0 + 500);
    const b = answerCorrectly(started(), T0 + 500);
    expect(a.score).toBe(b.score);
    expect(a.answers).toEqual(b.answers);
  });
});

describe('remainingMs', () => {
  it('is the full duration at the moment a question starts', () => {
    expect(remainingMs(started(), T0)).toBe(QUESTION_MS);
  });

  it('counts down', () => {
    expect(remainingMs(started(), T0 + 5000)).toBe(QUESTION_MS - 5000);
  });

  it('floors at zero rather than going negative', () => {
    expect(remainingMs(started(), T0 + QUESTION_MS * 2)).toBe(0);
  });

  it('is zero outside the question phase', () => {
    expect(remainingMs(initialState(), T0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run packages/core/src/game.test.ts
```

Expected: FAIL — cannot resolve `./game.js`.

- [ ] **Step 3: Implement**

`packages/core/src/game.ts`:

```ts
import type { Question } from './questions.js';
import { isCorrect } from './questions.js';
import { QUESTION_MS, scoreAnswer } from './scoring.js';

export type Phase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'question'
  | 'revealing'
  | 'finished'
  | 'submitting'
  | 'leaderboard'
  | 'error';

export interface AnswerRecord {
  code: string;
  /** The city the player picked, or null on a timeout. */
  chosen: string | null;
  correct: boolean;
  ms: number;
}

export interface GameState {
  phase: Phase;
  questions: Question[];
  index: number;
  /** Timestamp the current question started. Set from events, never Date.now(). */
  questionStartedAt: number;
  chosenIndex: number | null;
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  answers: AnswerRecord[];
  error: string | null;
}

export type GameEvent =
  | { type: 'LOAD' }
  | { type: 'LOADED'; questions: Question[] }
  | { type: 'START'; now: number }
  | { type: 'ANSWER'; optionIndex: number; now: number }
  | { type: 'TIMEOUT'; now: number }
  | { type: 'REVEAL_DONE'; now: number }
  | { type: 'SUBMIT' }
  | { type: 'SUBMIT_OK' }
  | { type: 'SUBMIT_FAILED'; reason: string }
  | { type: 'RESTART' }
  | { type: 'FAIL'; reason: string };

export function initialState(): GameState {
  return {
    phase: 'idle',
    questions: [],
    index: 0,
    questionStartedAt: 0,
    chosenIndex: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    answers: [],
    error: null,
  };
}

/**
 * Milliseconds left on the current question.
 *
 * This is a derived value on purpose. Routing every countdown tick through the
 * reducer would mean 15 state updates per question and a re-render storm; the
 * UI computes this from questionStartedAt instead and only dispatches TIMEOUT
 * when it actually reaches zero.
 */
export function remainingMs(
  state: GameState,
  now: number,
  totalMs: number = QUESTION_MS,
): number {
  if (state.phase !== 'question') return 0;
  return Math.max(0, totalMs - (now - state.questionStartedAt));
}

/** Shared handling for both an explicit answer and a timeout. */
function settle(
  state: GameState,
  chosenIndex: number | null,
  now: number,
): GameState {
  const question = state.questions[state.index];
  if (!question) return state;

  const chosen =
    chosenIndex === null ? null : question.options[chosenIndex] ?? null;
  const correct = chosen !== null && isCorrect(question, chosen);

  const elapsed = now - state.questionStartedAt;
  const remaining = Math.max(0, QUESTION_MS - elapsed);
  const streak = correct ? state.streak + 1 : 0;

  return {
    ...state,
    phase: 'revealing',
    chosenIndex,
    score: state.score + scoreAnswer(correct, remaining, streak),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    correctCount: state.correctCount + (correct ? 1 : 0),
    answers: [
      ...state.answers,
      {
        code: question.country.code,
        chosen,
        correct,
        ms: Math.max(0, elapsed),
      },
    ],
  };
}

export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'LOAD':
      return { ...state, phase: 'loading', error: null };

    case 'LOADED':
      return { ...state, phase: 'ready', questions: event.questions };

    case 'START':
      if (state.questions.length === 0) return state;
      return {
        ...state,
        phase: 'question',
        index: 0,
        questionStartedAt: event.now,
        chosenIndex: null,
      };

    case 'ANSWER':
      if (state.phase !== 'question') return state;
      return settle(state, event.optionIndex, event.now);

    case 'TIMEOUT':
      if (state.phase !== 'question') return state;
      return settle(state, null, event.now);

    case 'REVEAL_DONE': {
      if (state.phase !== 'revealing') return state;
      const next = state.index + 1;
      if (next >= state.questions.length) {
        return { ...state, phase: 'finished' };
      }
      return {
        ...state,
        phase: 'question',
        index: next,
        questionStartedAt: event.now,
        chosenIndex: null,
      };
    }

    case 'SUBMIT':
      if (state.phase !== 'finished') return state;
      return { ...state, phase: 'submitting', error: null };

    case 'SUBMIT_OK':
      return { ...state, phase: 'leaderboard' };

    case 'SUBMIT_FAILED':
      // Back to finished, not error: the player's score stays on screen and
      // stays retryable. A finished run is never lost to a write failure.
      return { ...state, phase: 'finished', error: event.reason };

    case 'RESTART':
      return initialState();

    case 'FAIL':
      return { ...state, phase: 'error', error: event.reason };
  }
}
```

- [ ] **Step 4: Export it**

`packages/core/src/index.ts`:

```ts
export * from './rng.js';
export * from './types.js';
export * from './scoring.js';
export * from './questions.js';
export * from './game.js';
```

- [ ] **Step 5: Run the whole core suite**

```bash
npx vitest run packages/core
```

Expected: PASS. The `game.test.ts` file contributes 22 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add clock-free game state machine"
```

---

### Task 10: Firebase client wrapper

**Files:**
- Create: `packages/data/src/client.ts`, `packages/data/src/index.ts`
- Test: `packages/data/src/client.test.ts`

**Interfaces:**
- Consumes: `Country`, `AnswerRecord` from `@capitales/core`.
- Produces:
  - `interface RunSummary { playerName: string; score: number; correctCount: number; bestStreak: number }`
  - `interface RunInput { playerName: string; score: number; correctCount: number; bestStreak: number; questionCount: number; startedAt: number; answers: AnswerRecord[] }`
  - `probeEmulator(host?: string, timeoutMs?: number): Promise<boolean>`
  - `connect(): Promise<string>` — signs in anonymously, returns the uid
  - `loadCountries(): Promise<Country[]>`
  - `saveRun(run: RunInput): Promise<void>`
  - `topScores(n?: number): Promise<RunSummary[]>`
  - `EmulatorUnreachableError`, `DatabaseEmptyError`

- [ ] **Step 1: Install the client SDK**

```bash
npm install -w @capitales/data firebase
```

- [ ] **Step 2: Write the failing test**

Only `probeEmulator` is unit-tested here; the Firestore paths are covered by the rules tests in Task 13 and by the Playwright run in Plan 2. Testing them here would mean mocking the SDK, which tests the mock rather than the code.

`packages/data/src/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeEmulator } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('probeEmulator', () => {
  it('reports reachable when the host answers at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Ok')));
    expect(await probeEmulator()).toBe(true);
  });

  it('reports reachable even on a 404, because something is listening', async () => {
    // The point is distinguishing "listening" from "nothing there" — any HTTP
    // response proves the emulator is up.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    expect(await probeEmulator()).toBe(true);
  });

  it('reports unreachable when the connection is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    expect(await probeEmulator()).toBe(false);
  });

  it('reports unreachable when the request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError');
      }),
    );
    expect(await probeEmulator('127.0.0.1:8080', 10)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
npx vitest run packages/data/src/client.test.ts
```

Expected: FAIL — cannot resolve `./client.js`.

- [ ] **Step 4: Implement**

`packages/data/src/client.ts`:

```ts
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  addDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import type { AnswerRecord, Country } from '@capitales/core';

const PROJECT_ID = 'demo-capitales';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_URL = 'http://127.0.0.1:9099';

export class EmulatorUnreachableError extends Error {
  constructor() {
    super(
      `Firebase emulator not reachable at ${FIRESTORE_HOST}:${FIRESTORE_PORT}. ` +
        `Run: npm run emulators`,
    );
    this.name = 'EmulatorUnreachableError';
  }
}

export class DatabaseEmptyError extends Error {
  constructor() {
    super('The countries collection is empty. Run: npm run seed');
    this.name = 'DatabaseEmptyError';
  }
}

export interface RunSummary {
  playerName: string;
  score: number;
  correctCount: number;
  bestStreak: number;
}

export interface RunInput extends RunSummary {
  questionCount: number;
  startedAt: number;
  answers: AnswerRecord[];
}

/**
 * Bounded reachability check.
 *
 * This exists because the Firestore SDK retries a dead emulator silently and
 * indefinitely: without this probe the app shows a blank screen and no error,
 * which is the single most confusing failure mode in local Firebase work.
 *
 * Any HTTP response counts as reachable — the question is whether something is
 * listening, not what it said.
 */
export async function probeEmulator(
  host: string = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    await fetch(`http://${host}/`, { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

function ensureApp(): { db: Firestore; auth: Auth } {
  if (!app) {
    // apiKey must be non-empty for the SDK to initialise, but with a demo-
    // prefixed project id it is never sent anywhere real.
    app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key' });
    db = getFirestore(app);
    auth = getAuth(app);
    connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);
    connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  }
  return { db: db as Firestore, auth: auth as Auth };
}

/** Signs in anonymously and returns the uid. Throws if the emulator is down. */
export async function connect(): Promise<string> {
  if (!(await probeEmulator())) throw new EmulatorUnreachableError();
  const { auth } = ensureApp();
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

/** Loads every country. Throws DatabaseEmptyError if nothing is seeded. */
export async function loadCountries(): Promise<Country[]> {
  const { db } = ensureApp();
  const snapshot = await getDocs(collection(db, 'countries'));
  if (snapshot.empty) throw new DatabaseEmptyError();
  return snapshot.docs.map((d) => d.data() as Country);
}

export async function saveRun(run: RunInput): Promise<void> {
  const { db, auth } = ensureApp();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  await addDoc(collection(db, 'runs'), {
    ...run,
    uid,
    startedAt: new Date(run.startedAt),
    finishedAt: serverTimestamp(),
  });
}

export async function topScores(n = 10): Promise<RunSummary[]> {
  const { db } = ensureApp();
  const snapshot = await getDocs(
    query(collection(db, 'runs'), orderBy('score', 'desc'), limit(n)),
  );
  return snapshot.docs.map((d) => {
    const data = d.data() as RunSummary;
    return {
      playerName: data.playerName,
      score: data.score,
      correctCount: data.correctCount,
      bestStreak: data.bestStreak,
    };
  });
}
```

- [ ] **Step 5: Create the package entry point**

`packages/data/src/index.ts`:

```ts
export * from './client.js';
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run packages/data/src/client.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/data package.json package-lock.json
git commit -m "feat(data): add firebase client with bounded emulator probe"
```

---

### Task 11: Svelte UI primitives

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/src/index.ts`
- Create: `packages/ui/src/CountryMap.svelte`, `packages/ui/src/Timer.svelte`, `packages/ui/src/AnswerButton.svelte`, `packages/ui/src/Scoreboard.svelte`

**Interfaces:**
- Consumes: `FittedCountry` shape from `@capitales/geo` (`pathD`, `dotXY`).
- Produces four components with these props:
  - `CountryMap` — `{ pathD: string; dotXY: [number, number]; width: number; height: number }`
  - `Timer` — `{ remaining: number; total: number }`
  - `AnswerButton` — `{ label: string; index: number; state: 'idle' | 'correct' | 'wrong' | 'muted'; onpick: (index: number) => void }`
  - `Scoreboard` — `{ score: number; streak: number; questionNumber: number; questionCount: number }`

- [ ] **Step 1: Create the package**

`packages/ui/package.json`:

```json
{
  "name": "@capitales/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./*.svelte": "./src/*.svelte"
  },
  "dependencies": {
    "@capitales/core": "*",
    "@capitales/geo": "*"
  }
}
```

```bash
npm install -w @capitales/ui -D svelte
```

- [ ] **Step 2: Write `CountryMap.svelte`**

A deliberately dumb component: it receives already-projected values and does no geometry of its own.

```svelte
<script lang="ts">
  interface Props {
    pathD: string;
    dotXY: [number, number];
    width: number;
    height: number;
  }
  let { pathD, dotXY, width, height }: Props = $props();
</script>

<svg
  class="country-map"
  viewBox="0 0 {width} {height}"
  role="img"
  aria-label="Country outline with its capital marked"
>
  <path d={pathD} class="outline" />
  <circle cx={dotXY[0]} cy={dotXY[1]} r="7" class="dot-halo" />
  <circle cx={dotXY[0]} cy={dotXY[1]} r="4" class="dot" />
</svg>

<style>
  .country-map {
    width: 100%;
    height: 100%;
    display: block;
  }
  .outline {
    fill: color-mix(in oklab, currentColor 12%, transparent);
    stroke: currentColor;
    stroke-width: 1.25;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .dot-halo {
    fill: color-mix(in oklab, tomato 35%, transparent);
  }
  .dot {
    fill: tomato;
    stroke: white;
    stroke-width: 1.5;
  }
</style>
```

`vector-effect: non-scaling-stroke` keeps the outline one consistent weight whatever the SVG scales to — without it, a country scaled up renders a hairline and one scaled down renders a blob.

- [ ] **Step 3: Write `Timer.svelte`**

```svelte
<script lang="ts">
  interface Props {
    remaining: number;
    total: number;
  }
  let { remaining, total }: Props = $props();

  let fraction = $derived(total > 0 ? Math.max(0, remaining / total) : 0);
  let seconds = $derived(Math.ceil(remaining / 1000));
  let urgent = $derived(fraction <= 0.25);
</script>

<div
  class="timer"
  role="timer"
  aria-label="{seconds} seconds remaining"
>
  <div class="bar" class:urgent style="--fraction: {fraction}"></div>
  <span class="seconds" class:urgent>{seconds}</span>
</div>

<style>
  .timer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .bar {
    position: relative;
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: color-mix(in oklab, currentColor 15%, transparent);
    overflow: hidden;
  }
  .bar::after {
    content: '';
    position: absolute;
    inset: 0;
    transform-origin: left;
    transform: scaleX(var(--fraction));
    background: currentColor;
  }
  .bar.urgent::after {
    background: tomato;
  }
  .seconds {
    font-variant-numeric: tabular-nums;
    min-width: 2ch;
    text-align: right;
  }
  .seconds.urgent {
    color: tomato;
  }
</style>
```

`font-variant-numeric: tabular-nums` stops the countdown jittering as digit widths change — a small thing that makes a timer feel finished.

- [ ] **Step 4: Write `AnswerButton.svelte`**

```svelte
<script lang="ts">
  interface Props {
    label: string;
    index: number;
    state: 'idle' | 'correct' | 'wrong' | 'muted';
    onpick: (index: number) => void;
  }
  let { label, index, state, onpick }: Props = $props();
</script>

<button
  type="button"
  class="answer {state}"
  disabled={state !== 'idle'}
  onclick={() => onpick(index)}
>
  <kbd>{index + 1}</kbd>
  <span>{label}</span>
</button>

<style>
  .answer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 44px;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .answer:hover:not(:disabled) {
    background: color-mix(in oklab, currentColor 8%, transparent);
  }
  .answer:disabled {
    cursor: default;
  }
  .answer.correct {
    border-color: seagreen;
    background: color-mix(in oklab, seagreen 20%, transparent);
  }
  .answer.wrong {
    border-color: tomato;
    background: color-mix(in oklab, tomato 20%, transparent);
  }
  .answer.muted {
    opacity: 0.45;
  }
  kbd {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.6em;
    height: 1.6em;
    border-radius: 0.3em;
    background: color-mix(in oklab, currentColor 15%, transparent);
    font-size: 0.8em;
  }
</style>
```

The `min-height: 44px` is here rather than in `apps/web` because it is the accessibility floor for a tap target, and Plan 2's mobile shell reuses this component unchanged.

- [ ] **Step 5: Write `Scoreboard.svelte`**

```svelte
<script lang="ts">
  interface Props {
    score: number;
    streak: number;
    questionNumber: number;
    questionCount: number;
  }
  let { score, streak, questionNumber, questionCount }: Props = $props();
</script>

<div class="scoreboard">
  <span class="progress">{questionNumber} / {questionCount}</span>
  <span class="score">{score}</span>
  {#if streak >= 2}
    <span class="streak">🔥 {streak}</span>
  {/if}
</div>

<style>
  .scoreboard {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    font-variant-numeric: tabular-nums;
  }
  .progress {
    opacity: 0.7;
  }
  .score {
    font-size: 1.5rem;
    font-weight: 700;
  }
</style>
```

- [ ] **Step 6: Create the entry point**

`packages/ui/src/index.ts`:

```ts
export { default as CountryMap } from './CountryMap.svelte';
export { default as Timer } from './Timer.svelte';
export { default as AnswerButton } from './AnswerButton.svelte';
export { default as Scoreboard } from './Scoreboard.svelte';
```

- [ ] **Step 7: Commit**

These components have no unit tests: they are pure presentation with no logic worth asserting, and they are exercised end to end by Plan 2's Playwright suite. Testing them with a DOM harness here would assert markup rather than behaviour.

```bash
git add packages/ui package.json package-lock.json
git commit -m "feat(ui): add map, timer, answer and scoreboard components"
```

---

### Task 12: The web app

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/svelte.config.js`, `apps/web/index.html`, `apps/web/src/main.ts`, `apps/web/src/app.css`, `apps/web/src/App.svelte`, `apps/web/src/game.svelte.ts`
- Modify: root `package.json` (add the `dev` and `build` scripts)

**Interfaces:**
- Consumes: everything produced by Tasks 2 and 5–11.
- Produces: `apps/web/dist` (the build output that Plan 2's Electron shell loads); the `npm run dev` script.

- [ ] **Step 1: Create the app package**

`apps/web/package.json`:

```json
{
  "name": "@capitales/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@capitales/core": "*",
    "@capitales/data": "*",
    "@capitales/geo": "*",
    "@capitales/ui": "*"
  }
}
```

```bash
npm install -w @capitales/web -D vite @sveltejs/vite-plugin-svelte svelte svelte-check @tsconfig/svelte tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configure Vite and Svelte**

`apps/web/svelte.config.js`:

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default { preprocess: vitePreprocess() };
```

`apps/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  server: { port: 5173 },
  // The workspace packages ship TypeScript source, not a build. Excluding them
  // from dependency pre-bundling lets Vite transform them like app code, so
  // edits in packages/* hot-reload instead of needing a rebuild.
  optimizeDeps: {
    exclude: ['@capitales/core', '@capitales/geo', '@capitales/data', '@capitales/ui'],
  },
});
```

- [ ] **Step 3: Create the HTML shell and stylesheet**

`apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Capitales</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`apps/web/src/app.css`:

```css
@import 'tailwindcss';

:root {
  color-scheme: light dark;
  --ink: light-dark(#1a1a1a, #ececec);
  --paper: light-dark(#fbfbf9, #16181c);
}

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--paper);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 4: Write the Svelte store wrapping the reducer**

This is the entire framework boundary. `packages/core` stays framework-free; this file is the only place that knows Svelte exists.

`apps/web/src/game.svelte.ts`:

```ts
import {
  buildRun,
  initialState,
  mulberry32,
  QUESTION_MS,
  reduce,
  remainingMs,
  type Country,
  type GameEvent,
  type GameState,
} from '@capitales/core';
import {
  connect,
  loadCountries,
  saveRun,
  topScores,
  type RunSummary,
} from '@capitales/data';

export const QUESTION_COUNT = 10;
const REVEAL_MS = 1200;

export function createGame() {
  let state = $state<GameState>(initialState());
  let countries = $state<Country[]>([]);
  let now = $state(Date.now());
  let leaderboard = $state<RunSummary[]>([]);
  let playerName = $state('Player');
  let startedAt = 0;

  function dispatch(event: GameEvent): void {
    state = reduce(state, event);
  }

  // One interval for the whole app. The reducer sees only the TIMEOUT it
  // produces, never the ticks.
  const tick = setInterval(() => {
    now = Date.now();
    if (state.phase === 'question' && remainingMs(state, now) <= 0) {
      dispatch({ type: 'TIMEOUT', now });
    }
  }, 100);

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => clearInterval(tick));
  }

  async function boot(): Promise<void> {
    dispatch({ type: 'LOAD' });
    try {
      await connect();
      countries = await loadCountries();
      start();
    } catch (err) {
      dispatch({
        type: 'FAIL',
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function start(): void {
    const seed = Math.floor(Math.random() * 2 ** 31);
    dispatch({
      type: 'LOADED',
      questions: buildRun(countries, QUESTION_COUNT, mulberry32(seed)),
    });
    startedAt = Date.now();
    dispatch({ type: 'START', now: Date.now() });
  }

  function pick(optionIndex: number): void {
    if (state.phase !== 'question') return;
    dispatch({ type: 'ANSWER', optionIndex, now: Date.now() });
    setTimeout(() => dispatch({ type: 'REVEAL_DONE', now: Date.now() }), REVEAL_MS);
  }

  async function submit(): Promise<void> {
    dispatch({ type: 'SUBMIT' });
    try {
      await saveRun({
        playerName,
        score: state.score,
        correctCount: state.correctCount,
        bestStreak: state.bestStreak,
        questionCount: QUESTION_COUNT,
        startedAt,
        answers: state.answers,
      });
      leaderboard = await topScores(10);
      dispatch({ type: 'SUBMIT_OK' });
    } catch (err) {
      dispatch({
        type: 'SUBMIT_FAILED',
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function restart(): void {
    dispatch({ type: 'RESTART' });
    start();
  }

  return {
    get state() { return state; },
    get remaining() { return remainingMs(state, now); },
    get total() { return QUESTION_MS; },
    get leaderboard() { return leaderboard; },
    get playerName() { return playerName; },
    set playerName(v: string) { playerName = v; },
    boot,
    pick,
    submit,
    restart,
  };
}
```

- [ ] **Step 5: Write `App.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Topology } from 'topojson-specification';
  import { buildAtlas, fitCountry } from '@capitales/geo';
  import { isCorrect } from '@capitales/core';
  import { AnswerButton, CountryMap, Scoreboard, Timer } from '@capitales/ui';
  import topo from '../../../packages/data/countries.topo.json';
  import { createGame, QUESTION_COUNT } from './game.svelte.js';

  const atlas = buildAtlas(topo as unknown as Topology);
  const BOX = { width: 640, height: 420 };

  const game = createGame();

  let question = $derived(game.state.questions[game.state.index]);

  let fitted = $derived.by(() => {
    if (!question) return null;
    const f = atlas.get(question.country.code);
    if (!f) return null;
    return fitCountry(f, question.country.capitalLonLat, BOX);
  });

  function optionState(i: number): 'idle' | 'correct' | 'wrong' | 'muted' {
    if (game.state.phase !== 'revealing' || !question) return 'idle';
    if (isCorrect(question, question.options[i] ?? '')) return 'correct';
    if (game.state.chosenIndex === i) return 'wrong';
    return 'muted';
  }

  function onKey(event: KeyboardEvent) {
    if (game.state.phase !== 'question') return;
    const n = Number(event.key);
    if (n >= 1 && n <= 4) game.pick(n - 1);
  }

  onMount(() => { void game.boot(); });
</script>

<svelte:window onkeydown={onKey} />

<main>
  {#if game.state.phase === 'loading' || game.state.phase === 'idle'}
    <p class="centred">Loading…</p>

  {:else if game.state.phase === 'error'}
    <div class="centred error">
      <h1>Cannot start</h1>
      <p>{game.state.error}</p>
    </div>

  {:else if game.state.phase === 'finished' || game.state.phase === 'submitting' || game.state.phase === 'leaderboard'}
    <div class="centred results">
      <h1>{game.state.score} points</h1>
      <p>
        {game.state.correctCount} of {QUESTION_COUNT} correct
        · best streak {game.state.bestStreak}
      </p>

      {#if game.state.error}
        <p class="banner">Could not save your score: {game.state.error}</p>
      {/if}

      {#if game.state.phase === 'leaderboard'}
        <ol class="leaderboard">
          {#each game.leaderboard as row, i (i)}
            <li><span>{row.playerName}</span><span>{row.score}</span></li>
          {/each}
        </ol>
        <button onclick={() => game.restart()}>Play again</button>
      {:else}
        <label>
          Name
          <input bind:value={game.playerName} maxlength="20" />
        </label>
        <button
          onclick={() => void game.submit()}
          disabled={game.state.phase === 'submitting'}
        >
          {game.state.phase === 'submitting' ? 'Saving…' : 'Save score'}
        </button>
      {/if}
    </div>

  {:else if question && fitted}
    <header>
      <Scoreboard
        score={game.state.score}
        streak={game.state.streak}
        questionNumber={game.state.index + 1}
        questionCount={QUESTION_COUNT}
      />
      <Timer remaining={game.remaining} total={game.total} />
    </header>

    <section class="map">
      <CountryMap
        pathD={fitted.pathD}
        dotXY={fitted.dotXY}
        width={BOX.width}
        height={BOX.height}
      />
    </section>

    <section class="answers">
      {#each question.options as option, i (option)}
        <AnswerButton
          label={option}
          index={i}
          state={optionState(i)}
          onpick={(idx) => game.pick(idx)}
        />
      {/each}
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 44rem;
    margin: 0 auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-height: 100dvh;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }
  header :global(.timer) {
    flex: 1;
    max-width: 14rem;
  }
  .map {
    flex: 1;
    min-height: 18rem;
    display: grid;
    place-items: center;
  }
  .answers {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }
  .centred {
    margin: auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }
  .error {
    color: tomato;
    max-width: 32rem;
  }
  .banner {
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    background: color-mix(in oklab, tomato 20%, transparent);
  }
  .leaderboard {
    list-style: decimal inside;
    padding: 0;
    width: 18rem;
  }
  .leaderboard li {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-variant-numeric: tabular-nums;
  }
</style>
```

- [ ] **Step 6: Write the entry point**

`apps/web/src/main.ts`:

```ts
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

export default mount(App, { target });
```

- [ ] **Step 7: Add the root scripts**

Add to the root `package.json` scripts:

```json
"dev": "npm run dev -w @capitales/web",
"build": "npm run build -w @capitales/web"
```

- [ ] **Step 8: Play it**

With `npm run emulators` running and `npm run seed` already done:

```bash
npm run dev
```

Open http://localhost:5173 and verify, in order:

1. A country outline renders with a red dot on it.
2. The timer counts down and the bar shrinks.
3. Pressing `1`–`4` picks an answer; so does clicking.
4. A correct pick turns green, a wrong pick turns red and the correct one still turns green.
5. The score increases faster for quick answers, and the streak badge appears from two consecutive correct answers.
6. Letting the timer expire scores nothing and advances.
7. After 10 questions the results screen shows, saving works, and the leaderboard lists the run.
8. Reload and play again — the previous run is still on the leaderboard.

- [ ] **Step 9: Verify the emulator-down error path**

Stop the emulator (Ctrl-C) and reload the page. Expected: the "Cannot start" screen naming `127.0.0.1:8080` and telling you to run `npm run emulators`, appearing within about two seconds — not a blank page and not an indefinite spinner.

Restart the emulator and reload to confirm recovery.

- [ ] **Step 10: Verify the not-seeded error path**

Stop the emulator, delete `.emulator-data`, restart it, and reload the page without seeding. Expected: the error screen telling you to run `npm run seed`. Then run `npm run seed` and reload.

- [ ] **Step 11: Commit**

```bash
git add apps package.json package-lock.json
git commit -m "feat(web): add playable quiz app"
```

---

### Task 13: Security rules tests

**Files:**
- Create: `packages/rules-tests/package.json`, `packages/rules-tests/src/rules.test.ts`
- Modify: root `package.json` (add the `test:rules` script), `vitest.config.ts`

**Interfaces:**
- Consumes: `firestore.rules` from Task 1.
- Produces: the `npm run test:rules` script.

- [ ] **Step 1: Create the package**

`packages/rules-tests/package.json`:

```json
{
  "name": "@capitales/rules-tests",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

```bash
npm install -w @capitales/rules-tests -D @firebase/rules-unit-testing firebase
```

- [ ] **Step 2: Exclude these tests from the default run**

They need a live emulator, so `npm test` must not pick them up. Change `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'packages/rules-tests/**'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Write the rules tests**

`packages/rules-tests/src/rules.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

let env: RulesTestEnvironment;

function run(uid: string) {
  return {
    playerName: 'Tester',
    uid,
    score: 1234,
    correctCount: 7,
    bestStreak: 3,
    questionCount: 10,
    answers: [],
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-capitales-rules',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'countries/FRA'), {
      code: 'FRA',
      name: 'France',
      capital: 'Paris',
    });
    await setDoc(doc(ctx.firestore(), 'runs/existing'), run('alice'));
  });
});

describe('countries', () => {
  it('is readable by a signed-in user', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'countries/FRA')));
  });

  it('is not readable when signed out', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'countries/FRA')));
  });

  it('is not writable, even by a signed-in user', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'countries/FRA'), { capital: 'Berlin' }));
  });
});

describe('runs', () => {
  it('lets a user create a run under their own uid', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'runs/mine'), run('alice')));
  });

  it('stops a user creating a run under someone else uid', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(setDoc(doc(db, 'runs/forged'), run('alice')));
  });

  it('stops an anonymous client creating a run', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'runs/anon'), run('alice')));
  });

  it('is publicly readable, so the leaderboard works signed out', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'runs/existing')));
  });

  it('stops a user editing their own past score', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, 'runs/existing'), { ...run('alice'), score: 999999 }),
    );
  });

  it('stops a user deleting a run', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(deleteDoc(doc(db, 'runs/existing')));
  });
});
```

- [ ] **Step 4: Add the script**

Add to the root `package.json` scripts:

```json
"test:rules": "vitest run --dir packages/rules-tests --config vitest.rules.config.ts"
```

And create `vitest.rules.config.ts` at the root:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/rules-tests/src/**/*.test.ts'],
    environment: 'node',
    // The rules emulator is shared state; parallel files would clear each
    // other's data mid-test.
    fileParallelism: false,
  },
});
```

- [ ] **Step 5: Run the rules tests**

With `npm run emulators` running:

```bash
npm run test:rules
```

Expected: PASS, 9 tests.

If every test fails with a connection error, the emulator is not running. If only the `assertFails` tests fail, the rules are more permissive than intended — read `firestore.rules` against spec §5.4 before changing any test.

- [ ] **Step 6: Run the full suite one last time**

```bash
npm test
```

Expected: PASS across `core`, `geo` and `data` — 88 tests, no emulator required.
With the 9 rules tests that is 97 in total.

- [ ] **Step 7: Update the README**

Add a Testing section:

```markdown
## Testing

    npm test          # core, geo and data — pure, no emulator needed
    npm run test:rules   # Firestore security rules — needs `npm run emulators`
```

- [ ] **Step 8: Commit**

```bash
git add packages/rules-tests vitest.config.ts vitest.rules.config.ts package.json package-lock.json README.md
git commit -m "test: verify firestore security rules against the emulator"
```

---

## Plan self-review

**Spec coverage (phases 1–6):**

| Spec section | Covered by |
|---|---|
| §3 Stack | Tasks 1, 2, 3, 5, 11, 12 |
| §4 Repository layout | Tasks 1–3, 5, 10–12 |
| §5.1 Static geometry, `ADM0_A3` keying | Tasks 3, 5 |
| §5.2 Firestore model | Tasks 3, 4, 10 |
| §5.3 Anonymous auth | Task 10 |
| §5.4 Security rules | Tasks 1, 13 |
| §5.5 ETL and seeding | Tasks 3, 4 |
| §5.6 Data edge cases | Task 3 (`overrides.json` + validation tests) |
| §6 Game rules | Tasks 7, 8 |
| §7 State machine | Task 9 |
| §8 Rendering | Tasks 5, 6, 11 |
| §9 `apps/web` variant | Task 12 |
| §10 Error handling | Tasks 10, 12 (steps 9–10), 9 (`SUBMIT_FAILED`) |
| §11 Accepted limitations | No task needed — a documented non-goal |
| §12 Testing (core, geo, rules) | Tasks 2, 3, 5–10, 13 |
| §13 Dev workflow scripts | Tasks 1, 3, 4, 12, 13 |
| §9 `apps/mobile`, `apps/desktop`; §12 e2e | **Plan 2**, deliberately out of scope |

**Type consistency:** `Country.code` is used identically in `capitals.json`, the Firestore document id, TopoJSON feature ids, `buildAtlas`'s map key, and `AnswerRecord.code`. `LonLat` is `[lon, lat]` in `types.ts`, the ETL output, `fitCountry`'s parameter, and the tests. `QUESTION_MS` is defined once in `scoring.ts` and imported by `game.ts` and the web store. `Question.correctIndex` is produced in Task 8 and consumed in Tasks 9 and 12 under the same name.

**Known deviation from the spec, deliberate:** spec §5.2 names the field `capitalLonLat` and gives Paris as `[2.3522, 48.8586]`; the ETL takes the exact coordinate from Natural Earth's geometry instead of that literal, so the committed value will differ in the last decimals. The spec value is illustrative, not authoritative.
