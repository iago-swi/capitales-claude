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

The game runs entirely locally. The database is the Firebase Emulator Suite; no
cloud project, no billing, no network access at play time.

## 2. Non-goals

Deliberately excluded to keep the first version finishable:

- Region or difficulty selection before a run
- Spaced repetition or per-country learning statistics
- Review-your-mistakes screen
- Any deployed/hosted version, real Firebase project, or non-anonymous accounts
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
| Geometry data | Natural Earth 110m via `world-atlas` (~100 KB TopoJSON) |
| Database | Firebase Emulator Suite (Firestore + Auth + Emulator UI) via `firebase-tools`; client is the modular `firebase` JS SDK |
| Game state | Pure reducer in `packages/core`, wrapped in a Svelte rune store |
| Unit tests | Vitest |
| Rules tests | `@firebase/rules-unit-testing` |
| End-to-end tests | Playwright |
| Desktop shell | Electron |
| Monorepo | npm workspaces |

Prerequisites already present on the target machine: Node 24, npm 11, Java 25
(required by the Firebase emulators), git 2.55.

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

## 4. Repository layout

```
Capitales/
├─ package.json              # npm workspaces root
├─ firebase.json             # emulator ports
├─ firestore.rules
├─ .firebaserc
├─ .emulator-data/           # persisted emulator state
├─ docs/superpowers/specs/
├─ packages/
│  ├─ core/                  # PURE TypeScript — no DOM, no firebase, no svelte
│  │  ├─ game.ts             # state machine: rounds, timer, streak, scoring
│  │  ├─ questions.ts        # buildQuestion(country, pool, rng) -> 4 options
│  │  ├─ scoring.ts
│  │  ├─ rng.ts              # seeded mulberry32
│  │  └─ types.ts
│  ├─ geo/                   # projection + path generation (d3-geo, no UI)
│  │  ├─ atlas.ts            # TopoJSON load, feature lookup by ISO numeric
│  │  └─ project.ts          # fitCountry(feature, box) -> { pathD, dotXY }
│  ├─ data/
│  │  ├─ capitals.json       # committed ETL output
│  │  ├─ overrides.json      # curated fixes for messy cases
│  │  ├─ build-capitals.ts   # one-time ETL from Natural Earth
│  │  └─ seed.ts             # writes countries/* into the emulator
│  └─ ui/                    # shared Svelte components
│     ├─ CountryMap.svelte
│     ├─ Timer.svelte
│     ├─ AnswerButton.svelte
│     └─ Scoreboard.svelte
└─ apps/
   ├─ web/                   # Vite + Svelte — desktop browser layout
   ├─ mobile/                # Vite + Svelte — touch-first layout
   └─ desktop/               # Electron main process, loads apps/web/dist
```

The dependency direction is strictly one-way:
`apps/* → packages/ui → packages/{core, geo, data}`. `core` imports nothing from
`geo`, `ui`, `data`, Svelte, the DOM, or Firebase.

## 5. Data

### 5.1 Static, bundled

Country geometry is **not** stored in Firestore. `countries-110m.json` is ~100 KB
of TopoJSON that never changes, so it is a bundled static asset versioned with the
code. Features are keyed by ISO 3166-1 numeric id.

### 5.2 Firestore model

Two collections.

`countries/{iso3}` — one document per **eligible country**, seeded once, read-only
to clients. The eligible set is the 195 UN member states minus the exclusions
listed in §5.6, so roughly 185–190 documents; the exact count is whatever
`capitals.json` contains and is not hardcoded anywhere.

```ts
{
  iso3: "FRA",
  isoNumeric: "250",                  // join key into the TopoJSON
  name: "France",
  capital: "Paris",
  capitalLonLat: [2.3522, 48.8566],   // GeoJSON order: [lon, lat]
  centroid: [2.45, 46.6],             // precomputed, for projection centering
  continent: "Europe"
}
```

Small enough to fetch in one query at boot and cache in memory for the session.

`runs/{runId}` — one document per completed game, append-only:

```ts
{
  uid: string,
  playerName: string,
  startedAt: Timestamp,
  finishedAt: Timestamp,
  score: number,
  correctCount: number,
  bestStreak: number,
  questionCount: 10,
  answers: [{ iso3: string, chosen: string, correct: boolean, ms: number }]
}
```

Ten answers as an inline array is far below the 1 MB document limit, so no
subcollection is needed.

The leaderboard is `orderBy('score', 'desc').limit(10)` over `runs`. There is no
separate `scores` collection to keep in sync.

### 5.3 Auth

Anonymous sign-in against the Auth emulator. No login screen, but every player
gets a stable `uid`, which the security rules require. A nickname is requested
once and denormalised onto each run document.

### 5.4 Security rules

Enforced by the emulator, and tested.

```
match /countries/{id} {
  allow read: if request.auth != null;
  allow write: if false;
}
match /runs/{id} {
  allow read: if true;
  allow create: if request.auth.uid == request.resource.data.uid;
  allow update, delete: if false;
}
```

`allow update, delete: if false` is what makes scores append-only: a player can
add a run but never edit or remove one.

### 5.5 ETL and seeding

`build-capitals.ts` runs once during development. It downloads the Natural Earth
`ne_110m_populated_places` dataset, filters to `FEATURECLA == "Admin-0 capital"`,
joins to the country list on `ADM0_A3`, applies `overrides.json`, and writes
`capitals.json`. The output is committed, so every later build is offline.

`seed.ts` reads `capitals.json` and writes `countries/*` into the running
emulator using the Admin SDK (which bypasses rules). It is idempotent: re-running
overwrites the same document ids.

Emulator state persists via
`firebase emulators:start --import ./.emulator-data --export-on-exit`, so seeded
data and leaderboard entries survive a restart. Without those flags the emulator
is in-memory only and wipes on exit.

### 5.6 Data edge cases

Named explicitly because each will otherwise surface as a confusing bug:

- **Multiple capitals.** South Africa has three (Pretoria, Cape Town,
  Bloemfontein), Bolivia two (Sucre, La Paz). `overrides.json` names one canonical
  answer per country and may list alternates that are also accepted.
- **Non-sovereign entries.** The Natural Earth 110m set includes territories with
  no capital or with disputed status (Greenland, Western Sahara, Antarctica).
  Filtered at ETL time via an explicit include-list, so the filter is auditable
  rather than accidental.
- **Micro-states.** Vatican City, Monaco, San Marino and Singapore are nearly
  invisible at 110m resolution. `fitExtent` will zoom to them, but the outline
  degrades to a blob. They are excluded from the pool via the same include-list.

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
its Firestore client at the same emulator on `127.0.0.1`.

## 10. Error handling

| Failure | Behaviour |
|---|---|
| Emulator not running | The Firestore SDK retries silently and indefinitely, producing a blank screen with no error. A bounded startup probe times out and shows "Emulator not reachable at 127.0.0.1:8080 — run `npm run emulators`". |
| `countries` collection empty | Detected at boot: "Database not seeded — run `npm run seed`". |
| TopoJSON asset fails to load | Hard error screen at boot. |
| A seeded country has no matching geometry | Dropped from the pool at boot with a console warning. |
| Saving a finished run fails | The score stays on screen, a banner reports the failure, and a retry button re-attempts the write. |
| Anonymous sign-in fails | Same treatment as the emulator being unreachable. |

The governing principle: **fail loud at boot, fail soft during play.** A data
problem must never crash a run in progress, and a finished run must never be lost
to a write error.

## 11. Accepted limitations

Because `countries` holds the capital name and the client fetches every eligible
country document at boot, the correct answer is present in browser memory before
the player clicks. This is accepted deliberately. Preventing it would require a Cloud
Function grading answers server-side, which is substantial complexity for no
benefit in a local single-player game.

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
- **Rules** — `@firebase/rules-unit-testing`: client A cannot create a run
  claiming client B's uid; no client can update or delete an existing run;
  unauthenticated reads of `countries` are denied.
- **End-to-end** — Playwright against `apps/web` with the emulators running:
  play a complete ten-question run by clicking the first option each time, assert
  the finish screen renders, and assert a `runs` document exists in Firestore.

## 13. Local development workflow

| Script | Command |
|---|---|
| `npm run emulators` | `firebase emulators:start --import ./.emulator-data --export-on-exit` |
| `npm run seed` | seeds `countries/*` into the running emulator |
| `npm run build:capitals` | re-runs the ETL (rarely needed; output is committed) |
| `npm run dev` | Vite dev server for `apps/web` |
| `npm run dev:mobile` | Vite dev server for `apps/mobile` |
| `npm run dev:desktop` | builds `apps/web` and launches Electron |
| `npm test` | Vitest across `core` and `geo` |
| `npm run test:rules` | Firestore rules tests |
| `npm run e2e` | Playwright |

Emulator ports: Firestore 8080, Auth 9099, Emulator UI 4000.

## 14. Build order

Risky and load-bearing work first, so that a wrong assumption surfaces on day one
rather than day ten.

1. Scaffold: workspaces, Vite, Tailwind, emulator config. Prove
   `firebase emulators:start` runs against Java 25.
2. `packages/data`: ETL to `capitals.json`, `overrides.json`, seed script.
   Verify the document count in the Emulator UI matches `capitals.json`.
3. `packages/geo` plus its tests. This is the highest-risk component.
4. `packages/core` plus its tests.
5. `apps/web`: playable end to end against seeded data.
6. Firestore run writes, leaderboard query, security rules, rules tests.
7. `apps/mobile`.
8. `apps/desktop` Electron shell.
9. Playwright end-to-end suite.
