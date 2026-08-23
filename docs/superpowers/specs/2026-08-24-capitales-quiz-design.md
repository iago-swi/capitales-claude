# Capitales — Design

**Date:** 2026-08-24
**Status:** Approved, ready for implementation planning

## 1. Overview

A remake of a Visual Basic quiz game written ~1996. The screen shows the outline
of a single country with a dot marking its capital. The player picks the correct
city name from four options.

The remake keeps the original loop intact and adds a countdown timer, a speed and
streak bonus, and a persisted leaderboard. It ships as three comparable variants
built from one shared core: a desktop-browser web app, a touch-first mobile web
app, and a native desktop window.

The game runs entirely locally. Data lives in a SQLite file behind a small local
HTTP API; no cloud service, no account, no network access at play time.

## 2. Non-goals

Deliberately excluded to keep the first version finishable:

- Region or difficulty selection before a run
- Spaced repetition or per-country learning statistics
- Review-your-mistakes screen
- Any deployed or hosted version; the API server binds to localhost only
- User accounts, passwords or authentication of any kind (see §5.3)
- Server-side answer grading (see §11, accepted limitations)
- Localisation. UI text is English; country and city names come from the dataset.

## 3. Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Build / dev server | Vite |
| UI framework | Svelte 5 (runes) |
| Styling | Tailwind CSS v4 (Vite plugin) |
| Map rendering | `d3-geo` + `topojson-client`, rendered as inline SVG |
| Geometry data | Natural Earth **50m** admin-0 countries, trimmed and converted to TopoJSON by this project's own ETL (~556 KB, measured) |
| Database | **SQLite**, via Node 24's built-in `node:sqlite`. No dependency, no native build. |
| API server | Node's built-in `node:http`. Four JSON endpoints, no framework. |
| Game state | Pure reducer in `packages/core`, wrapped in a Svelte rune store |
| Unit and API tests | Vitest |
| End-to-end tests | Playwright |
| Desktop shell | Electron |
| Monorepo | npm workspaces |

Prerequisites already present on the target machine: Node 24, npm 11, git 2.55.
No Java, no database server, and no runtime dependency outside Node itself for
the data layer.

`node:sqlite` is what makes this cheap. The historical reason hobby projects
avoided SQLite in Node was `better-sqlite3`'s native build step, which on Windows
meant node-gyp and MSVC build tools. Node 24 ships SQLite in core, so that cost
is gone.

`node:http` over Express is a deliberate call for four endpoints with no
middleware: Vite's dev proxy removes the CORS problem, and the whole server is
about 120 lines. If routing ever grows past trivial, swapping in Express is a
contained change confined to one file.

### Rejected alternatives

- **Leaflet / MapLibre / Google Maps** — they render labelled basemaps, which
  displays the answer on screen, and they need tiles, which needs the network.
- **Next.js** — server-side rendering buys nothing for a fully client-side
  offline game and complicates Electron packaging.
- **Pre-rendered per-country SVG assets** — loses control of the projection and
  forces hand-placement of every capital dot in pixel space.
- **Tauri** — smaller installer than Electron (~5 MB vs ~100 MB) but requires the
  Rust toolchain and MSVC Build Tools, neither installed. The shell owns no game
  logic, so switching later is a contained change.
- **React** — considered and set aside in favour of Svelte 5. Because `core` is
  framework-free, only the ~20-line store wrapper would change.
- **`world-atlas` at 110m resolution** — the original choice, replaced after
  inspecting the data. 110m contains 177 country features yielding only 163
  playable countries; it omits Singapore, Malta, Monaco, Vatican, Andorra,
  Liechtenstein and every Caribbean and Pacific island state outright. It also
  forces a join on ISO numeric ids, which the `-99` sentinel breaks (§5.6).
  50m yields 193 playable countries for 556 KB and needs no cross-dataset join.
- **REST Countries API** as the capitals source — the v3.1 endpoint is
  deprecated and now returns an error payload instead of data.
- **Firebase Emulator Suite** — the original choice, replaced after weighing it
  against what the game actually stores: 193 immutable country records and a
  leaderboard. Firestore's only real job would have been handing back all 193
  records at boot, which is a database acting as a file loader. It also required
  a Java process in a second terminal, and `orderBy('score','desc')` is a query
  SQL does natively. What was genuinely lost is declarative security rules; §5.4
  describes how the API replaces them.
- **SQLite compiled to WASM, running in the page** (`@sqlite.org/sqlite-wasm`) —
  rejected outright. It needs a Web Worker plus OPFS for persistence, which wants
  `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers, and it
  gives every browser its own private database. Worse, the Electron shell would
  want native SQLite instead, so the project would carry two data layers and
  break the one-core-three-shells design.

## 4. Repository layout

```
Capitales/
├─ package.json              # npm workspaces root
├─ .data/capitales.db        # the SQLite file, gitignored
├─ docs/superpowers/specs/
├─ packages/
│  ├─ core/                  # PURE TypeScript — no DOM, no HTTP, no svelte
│  │  ├─ game.ts             # state machine: rounds, timer, streak, scoring
│  │  ├─ questions.ts        # buildQuestion(country, pool, rng) -> 4 options
│  │  ├─ scoring.ts
│  │  ├─ rng.ts              # seeded mulberry32
│  │  └─ types.ts
│  ├─ geo/                   # projection + path generation (d3-geo, no UI)
│  │  ├─ atlas.ts            # TopoJSON load, feature lookup by ADM0_A3 code
│  │  └─ project.ts          # fitCountry(feature, box) -> { pathD, dotXY }
│  ├─ data/                  # datasets + the HTTP client the browser uses
│  │  ├─ capitals.json        # committed ETL output: the 193 eligible countries
│  │  ├─ countries.topo.json  # committed ETL output: trimmed 50m TopoJSON
│  │  ├─ overrides.json       # hand-curated fixes, see §5.6
│  │  ├─ build-data.ts        # one-time ETL from Natural Earth
│  │  └─ client.ts            # fetch wrapper around the API, no SQL here
│  └─ ui/                    # shared Svelte components
│     ├─ CountryMap.svelte
│     ├─ Timer.svelte
│     ├─ AnswerButton.svelte
│     └─ Scoreboard.svelte
└─ apps/
   ├─ server/                # the only place that touches SQLite
   │  ├─ schema.sql           # tables and indexes
   │  ├─ db.ts                # open the file, apply schema, typed queries
   │  ├─ routes.ts            # request -> response, no HTTP plumbing
   │  ├─ server.ts            # node:http wiring and startup
   │  └─ seed.ts              # loads capitals.json into the countries table
   ├─ web/                   # Vite + Svelte — desktop browser layout
   ├─ mobile/                # Vite + Svelte — touch-first layout
   └─ desktop/               # Electron main process, loads apps/web/dist
```

The dependency direction is strictly one-way:
`apps/{web,mobile,desktop} → packages/ui → packages/{core, geo, data}`.
`core` imports nothing from `geo`, `ui`, `data`, Svelte, the DOM, or `node:*`.

`apps/server` is the **only** module that imports `node:sqlite` or writes SQL.
Nothing in `packages/` knows a database exists; `packages/data/client.ts` sees
only JSON over HTTP. That boundary is what makes the browser bundle free of
server code and keeps the swap to any other backend a single-file change.

## 5. Data

### 5.1 Static, bundled

Country geometry is **not** stored in the database. `countries.topo.json` is ~556 KB
of TopoJSON that never changes, so it is a bundled static asset versioned with the
code and committed to the repository.

Features are keyed by Natural Earth's **`ADM0_A3`** code, referred to throughout
as `code`. This is *not* the ISO numeric id, and the distinction matters:
Natural Earth sets `ISO_A3` and `ISO_N3` to the sentinel `-99` for five entries,
including **France and Norway**, so any join on an ISO field silently loses them.
`ADM0_A3` is populated for every feature and unique across the dataset. It equals
ISO 3166-1 alpha-3 for nearly all eligible countries; the handful of exceptions
(e.g. `KOS` for Kosovo) are internal identifiers only and never shown to players.

### 5.2 SQL schema

Three tables. The whole schema lives in `apps/server/schema.sql` and is applied
with `CREATE TABLE IF NOT EXISTS` on every server start, so there is no migration
tooling and starting from an empty file always works.

```sql
CREATE TABLE IF NOT EXISTS countries (
  code          TEXT PRIMARY KEY,     -- Natural Earth ADM0_A3, see §5.1
  name          TEXT NOT NULL,
  capital       TEXT NOT NULL,
  capital_lon   REAL NOT NULL,
  capital_lat   REAL NOT NULL,
  centroid_lon  REAL NOT NULL,
  centroid_lat  REAL NOT NULL,
  continent     TEXT NOT NULL,
  alt_capitals  TEXT NOT NULL DEFAULT '[]'   -- JSON array of strings
) STRICT;

CREATE TABLE IF NOT EXISTS runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name    TEXT NOT NULL,
  score          INTEGER NOT NULL,
  correct_count  INTEGER NOT NULL,
  best_streak    INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  started_at     TEXT NOT NULL,
  finished_at    TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS run_answers (
  run_id    INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,          -- 0-based index within the run
  code      TEXT NOT NULL,
  chosen    TEXT,                      -- NULL on a timeout
  correct   INTEGER NOT NULL,          -- 0 or 1; SQLite has no boolean
  ms        INTEGER NOT NULL,
  PRIMARY KEY (run_id, position)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_runs_score ON runs (score DESC);
```

Three decisions worth stating:

**Coordinates are separate `REAL` columns**, not a JSON blob. They are the only
values the app might ever want to query on, and a column is free.

**`alt_capitals` stays JSON.** It is a short list read as a unit and never
filtered on, so a fourth table would be ceremony.

**`run_answers` is normalised** even though §2 rules out learning statistics.
This is a deliberate, cheap departure from YAGNI: it is one extra table and one
insert loop, and it preserves the ability to ask "which capitals do I keep
getting wrong" later without a migration. Throwing the per-answer detail into an
unqueryable blob would discard the main reason to prefer SQL here.

`STRICT` tables are worth having: without them SQLite happily stores the string
`"banana"` in an `INTEGER` column. They turn a whole class of silent data
corruption into an immediate error.

### 5.3 Identity

There is none, deliberately. The server binds to `127.0.0.1` only, so the sole
client is the person sitting at the machine. A player types a nickname once; it
is stored on the run row and used for nothing but display. No accounts, no
passwords, no sessions, no tokens.

### 5.4 API surface and the append-only guarantee

The server exposes four endpoints on port **8787**, all under `/api`:

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/health` | `{ ok: true, countries: 193 }` |
| `GET` | `/api/countries` | `Country[]` — all 193, one query |
| `POST` | `/api/runs` | `{ id: number }` — records one finished game |
| `GET` | `/api/leaderboard?limit=10` | `RunSummary[]`, highest score first |

This is the replacement for Firestore security rules, and it is worth being
explicit about how the guarantee is achieved, because it is now structural rather
than declarative:

- **Countries are read-only** because no route writes to that table. The seed
  script is a separate process, not an endpoint.
- **Runs are append-only** because there is no `PUT`, `PATCH` or `DELETE` route
  anywhere. A client cannot edit a past score because the verb does not exist.
- Any unknown method or path returns `404`, and a malformed body returns `400`.

Firestore's `allow update, delete: if false` was four declarative lines; here the
same property comes from the absence of code, which is harder to see in a diff.
The API tests in §12 therefore assert the negative directly — that `PUT` and
`DELETE` against an existing run are rejected — so the guarantee is checked
rather than assumed.

Writing a run inserts into `runs` and `run_answers` inside **one transaction**,
so a failure part-way cannot leave a run with half its answers.

### 5.5 ETL and seeding

`build-data.ts` runs once during development. It is the only step that needs the
network; both of its outputs are committed, so every later build and every test
run is fully offline.

Source datasets, both from the official `nvkelso/natural-earth-vector`
repository at the `master` ref:

- `geojson/ne_50m_admin_0_countries.geojson` — 242 features, geometry plus
  `ADM0_A3`, `NAME`, `TYPE`, `CONTINENT`
- `geojson/ne_50m_populated_places.geojson` — city points, of which those with
  `FEATURECLA == "Admin-0 capital"` are national capitals

Pipeline:

1. Index capitals by `ADM0_A3`.
2. Keep country features whose `TYPE` is `Country` or `Sovereign country`.
3. Keep only those that have at least one Admin-0 capital (see §5.6 — this is the
   filter that removes dependencies without a hand-maintained blocklist).
4. Apply `overrides.json`: force a canonical capital where several exist, inject
   the two missing ones, and drop explicitly excluded codes.
5. Compute each country's `centroid` with `d3-geo`'s `geoCentroid` on its own
   geometry, rather than trusting any dataset field.
6. Emit `capitals.json`, sorted by `code` for stable diffs.
7. Emit `countries.topo.json`: the same countries' geometry, stripped of all 137
   Natural Earth properties, converted with `topojson-server`, simplified with
   `topojson-simplify`, and quantized to a 1e5 grid.

The ETL **fails loudly** if it encounters a multi-capital country or a
capital-less sovereign country that `overrides.json` does not mention. New
anomalies must be decided by a human, never silently dropped.

`apps/server/seed.ts` reads `capitals.json` and upserts it into the `countries`
table with `INSERT ... ON CONFLICT(code) DO UPDATE`. It is idempotent: re-running
refreshes the same 193 rows rather than duplicating them, and it never touches
`runs`, so re-seeding after a data fix does not wipe the leaderboard.

Persistence is simply a file. `.data/capitales.db` survives restarts because it
is a file on disk, with no export or import step. It is gitignored; `npm run seed`
recreates the country rows from committed inputs at any time.

### 5.6 Data edge cases

These are the actual anomalies in the 50m dataset, enumerated by inspecting it
rather than guessed. Each would otherwise surface as a confusing bug.

**The `-99` sentinel.** Natural Earth sets `ISO_A3` and `ISO_N3` to `-99` for
`NOR`, `FRA`, `CYN`, `SOL` and `KOS`. Joining on either field loses France and
Norway silently — no error, they simply never appear in a quiz. `ADM0_A3` is used
instead throughout (§5.1).

**Multiple capitals** — four countries carry more than one `Admin-0 capital`
point. `overrides.json` names the canonical answer; `altCapitals` holds names
that are also accepted if chosen:

| Code | Dataset lists | Canonical | Also accepted |
|---|---|---|---|
| `ZAF` | Pretoria, Cape Town, Bloemfontein, Johannesburg | Pretoria | Cape Town, Bloemfontein |
| `BOL` | Sucre, La Paz | Sucre | La Paz |
| `CIV` | Yamoussoukro, Abidjan | Yamoussoukro | Abidjan |
| `MMR` | Naypyidaw, Yangon | Naypyidaw | — |

Note that Natural Earth tags **Johannesburg** as an Admin-0 capital of South
Africa, which it is not. Taking the first match from the dataset would therefore
produce a wrong answer, not merely an ambiguous one.

**Missing capitals** — two genuine sovereign states have no Admin-0 capital point
at all and must be injected by `overrides.json`, or they vanish from the game:

| Code | Country | Injected capital | Coordinates `[lon, lat]` |
|---|---|---|---|
| `SDS` | South Sudan | Juba | `[31.5825, 4.8517]` |
| `NRU` | Nauru | Yaren | `[166.9209, -0.5477]` |

**Dependencies typed as `Country`.** Exactly ten entries have `TYPE == "Country"`
but are not sovereign: Jersey, Guernsey, Isle of Man, Åland, Aruba, Curaçao,
Sint Maarten, Greenland, Hong Kong and Macao. All ten lack an Admin-0 capital, so
filter step 3 in §5.5 removes them for free. This is deliberately preferred over a
hand-maintained blocklist: the filter derives from data the ETL already needs, so
it cannot drift out of date.

**Disputed entities.** `CYN` (Northern Cyprus) is excluded explicitly in
`overrides.json`. It has no Admin-0 capital, so step 3 already drops it; the
explicit entry documents that this is intended rather than incidental.

Together these give the ETL a precise, loud rule. Of the thirteen entries with no
Admin-0 capital, exactly three are typed `Sovereign country` — `SDS`, `NRU` and
`CYN` — and all three are named in `overrides.json`. So:

- no capital **and** `TYPE == "Country"` → a dependency; skip and log
- no capital **and** `TYPE == "Sovereign country"` **and** not in `overrides.json`
  → **throw**, because a real country is about to disappear silently

That second rule is what would have caught South Sudan.

The resulting eligible set is **193 countries**.

## 6. Game rules

A run is 10 questions with a 15-second countdown each.

**Question generation.** Ten distinct countries are drawn from the eligible pool
with a seeded RNG. Each question presents four options: the correct capital plus
three distractors drawn preferentially from the same continent, falling back to
the global pool when a continent cannot supply three. Options must be distinct
and are shuffled with the same seeded RNG.

Same-continent distractors are a deliberate design choice: "Paris / Berlin /
Madrid / Rome" is a real question, whereas "Paris / Ulaanbaatar / Suva /
Asunción" gives the answer away.

**Scoring.**

A wrong answer or a timeout scores 0 and resets the streak to 0. A correct answer
scores:

```
speedBonus = 100 * remainingMs / totalMs        // 0 at the buzzer, ~100 instantly
streak     = number of consecutive correct answers *including this one*
multiplier = min(1 + 0.25 * (streak - 1), 2)    // 1, 1.25, 1.5, 1.75, then 2
points     = round((100 + speedBonus) * multiplier)
```

So the first correct answer of a streak is worth 100–200 points, and the fifth
and every subsequent one is worth 200–400. The multiplier counts the current
answer, so it is never 0 and never applies to a question the player got wrong.

The final score is the sum of the ten per-question `points` values. Rounding
happens once per question, not once at the end, so the running total shown during
play always equals the final score.

## 7. State machine

```
idle → loading → ready → question ⇄ revealing → … → finished → submitting → leaderboard
                                                                     ↘ error
```

`revealing` is a ~1.2 s beat that highlights the correct option before advancing.

`core/game.ts` exports a pure `reduce(state, event) -> state`. Events:
`START`, `ANSWER(optionIndex, now)`, `TIMEOUT(now)`, `REVEAL_DONE`,
`SUBMIT_OK`, `SUBMIT_FAILED(reason)`, `RESTART`.

Two rules make this testable:

1. **The reducer never reads the clock.** Events carry `now`; state holds
   `questionStartedAt`. "Answered with 3 ms remaining" is an ordinary unit test
   rather than a timer-mocking exercise.
2. **Countdown ticks are not state transitions.** The remaining time is a Svelte
   `$derived` value computed from `questionStartedAt`. Only actual expiry
   dispatches `TIMEOUT`. Routing every tick through the reducer would cause 15
   state updates per question.

## 8. Rendering

`geo/project.ts` exports `fitCountry(feature, box) -> { pathD, dotXY }`.

It builds a `geoAzimuthalEqualArea` projection centred on the country's centroid,
calls `projection.fitExtent(box, feature)` to scale and translate so the country
fills the viewport, then uses `geoPath(projection)` for the outline and
`projection(capitalLonLat)` for the dot.

Because the outline and the dot pass through the same projection instance they
cannot drift out of sync. An equal-area projection avoids the Mercator distortion
that would render Greenland and Canada absurdly and subtly leak difficulty cues.

`CountryMap.svelte` is a dumb component: it receives `pathD` and `dotXY` and
renders an `<svg>` with one `<path>` and one `<circle>`. It performs no
projection maths of its own.

## 9. The three variants

| Variant | Layout | Input |
|---|---|---|
| `apps/web` | Large centred map, answers in a 2×2 grid, header with score and timer | Mouse, plus keys `1`–`4` and Enter to advance |
| `apps/mobile` | Map in the top ~55% of the viewport, answers as a full-width vertical stack, timer as a thin progress bar | Touch, tap targets ≥ 44 px, no hover states, safe-area insets |
| `apps/desktop` | Electron window wrapping `apps/web/dist`, native menu, remembers window size | Same as web |

All three import identical `core`, `geo` and `data`. `packages/ui` supplies the
primitives; each app composes its own layout and CSS. The desktop shell points
its API client at the same server on `127.0.0.1:8787`.

## 10. Error handling

| Failure | Behaviour |
|---|---|
| API server not running | `fetch` to a closed port fails fast with a `TypeError`, so a bounded probe of `/api/health` at boot shows "API server not reachable at 127.0.0.1:8787 — run `npm run server`". |
| `countries` table empty | `/api/health` reports `countries: 0`, detected at boot: "Database not seeded — run `npm run seed`". |
| TopoJSON asset fails to load | Hard error screen at boot. |
| A country row has no matching geometry | Dropped from the pool at boot with a console warning. |
| Saving a finished run fails | The score stays on screen, a banner reports the failure, and a retry button re-attempts the write. |
| The server throws on a request | Logged with the failing route, and returned as a `500` with a JSON `{ error }` body — never an HTML stack trace. |

The governing principle: **fail loud at boot, fail soft during play.** A data
problem must never crash a run in progress, and a finished run must never be lost
to a write error.

## 11. Accepted limitations

Because `/api/countries` returns the capital name and the client fetches every
eligible country at boot, the correct answer is present in browser memory before
the player clicks. The same is true of the score: the client computes it and the
server records whatever it is told.

Both are accepted deliberately. Closing either would mean the server holding the
questions and grading answers, which is substantial complexity for no benefit in
a local single-player game where the only person who could cheat is the person
who wants to play.

## 12. Testing

- **`packages/core`** — Vitest, pure unit tests. The seeded RNG makes generation
  fully deterministic: the same seed yields the same ten countries in the same
  order with the same option ordering. Asserts: no duplicate options; the correct
  answer is always among the four; distractors prefer the same continent;
  scoring at boundaries (zero time remaining, streak cap reached); timeout scores
  as a wrong answer.
- **`packages/geo`** — Vitest. Given France's feature and a 600×400 box, the
  generated path is non-empty and its bounding box fits inside the box, and
  Paris's `dotXY` falls inside that bounding box. This assertion catches the
  classic `[lat, lon]` versus `[lon, lat]` swap: swapped, Paris projects into the
  Indian Ocean and lands far outside the frame.
- **`apps/server`** — Vitest. The server is started in-process on an ephemeral
  port against an **in-memory** SQLite database (`:memory:`), and driven with
  plain `fetch`. No external process, no fixture files, no cleanup: every test
  file gets a pristine database for free. Asserts: `/api/countries` returns the
  seeded rows; posting a run persists it together with its answers; the
  leaderboard sorts by score descending and respects `limit`; a malformed body
  is rejected with `400`; an unknown path returns `404`; and — checking the
  append-only guarantee of §5.4 directly — `PUT` and `DELETE` against an existing
  run are both rejected.
- **End-to-end** — Playwright against `apps/web` with the API server running:
  play a complete ten-question run by clicking the first option each time, assert
  the finish screen renders, and assert the run appears in the leaderboard.

Because the database runs in-process, the entire suite except Playwright is a
single `npm test` with nothing to start first.

## 13. Local development workflow

| Script | Command |
|---|---|
| `npm run server` | starts the API server on 8787 against `.data/capitales.db` |
| `npm run seed` | upserts `capitals.json` into the `countries` table |
| `npm run build:data` | re-runs the ETL (rarely needed; output is committed) |
| `npm run dev` | Vite dev server for `apps/web`, proxying `/api` to 8787 |
| `npm run dev:mobile` | Vite dev server for `apps/mobile` |
| `npm run dev:desktop` | builds `apps/web` and launches Electron |
| `npm test` | Vitest across `core`, `geo`, `data` and `server` |
| `npm run e2e` | Playwright |

The API server listens on `127.0.0.1:8787`. Vite proxies `/api` to it, so the
browser sees a single origin and CORS never enters the picture.

`npm run seed` requires nothing to be running: it opens the database file
directly. Only the browser needs the server.

## 14. Build order

Risky and load-bearing work first, so that a wrong assumption surfaces on day one
rather than day ten.

1. Scaffold: workspaces, Vite, Tailwind, TypeScript config.
2. `packages/data`: ETL producing `capitals.json` and `countries.topo.json`,
   plus `overrides.json`.
3. `apps/server`: schema, seed script, and the four endpoints, with API tests.
   Verify 193 rows.
4. `packages/geo` plus its tests. This is the highest-risk component.
5. `packages/core` plus its tests.
6. `apps/web`: playable end to end, run writes and leaderboard included.
7. `apps/mobile`.
8. `apps/desktop` Electron shell.
9. Playwright end-to-end suite.
