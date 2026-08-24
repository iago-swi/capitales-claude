# Capitales — everything worth knowing

A capital-cities quiz. The screen shows the outline of one country with a dot on
its capital; you pick the right city from four options. It's a remake of a
Visual Basic game from around 1996.

It runs entirely on your machine — no cloud service, no account, no network
access once the data is built.

---

## 1. Running it

You need **Node 24+** and **npm 11+**. Nothing else: no Java, no database
server, no build tools.

```bash
npm install
npm run seed        # once, loads 193 countries into SQLite
```

Then two terminals:

```bash
npm run server      # JSON API on http://127.0.0.1:8787
npm run dev         # the game on http://localhost:5173
```

### Every script

| Script | What it does |
|---|---|
| `npm run seed` | Loads `capitals.json` into the database. Idempotent — safe to re-run. |
| `npm run server` | Starts the API. Needs nothing else running. |
| `npm run dev` | Vite dev server for the web app, proxying `/api` to the server. |
| `npm run build` | Production bundle into `apps/web/dist`. |
| `npm run build:data` | Re-runs the Natural Earth ETL. Rarely needed; outputs are committed. |
| `npm test` | The whole suite — 160 tests, nothing to start first. |
| `npm run typecheck` | `tsc --noEmit` across every package. |

---

## 2. Where the SQLite file is

**`.data/capitales.db`** at the repository root. It's gitignored.

It is *derived state*: `npm run seed` rebuilds every country row from committed
inputs, so deleting it costs you nothing but your local high scores. If you
change the schema, delete it and re-seed — there is no migration tooling by
design.

```bash
rm -rf .data && npm run seed
```

To poke at it directly, Node 24 has SQLite built in — no client to install:

```bash
node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('.data/capitales.db');console.table(d.prepare('SELECT player_name,score FROM runs ORDER BY score DESC LIMIT 10').all())"
```

---

## 3. The SQLite decision

The project originally specified a local Firebase emulator. It was replaced
after looking honestly at what the game actually stores: 193 immutable country
records and a leaderboard.

Firestore's only real job would have been handing back all 193 records at boot —
a database acting as a file loader. It also needed a Java process running in a
second terminal, and the one genuine query the game makes (`ORDER BY score DESC
LIMIT 10`) is something SQL does natively and a document store does only because
that particular shape happens to be indexable.

**What made SQLite cheap is `node:sqlite`.** The historical reason hobby Node
projects avoided SQLite was `better-sqlite3`'s native build step, which on
Windows meant node-gyp and multi-gigabyte MSVC build tools. Node 22 shipped
SQLite in core and Node 24 has it stable, so the data layer now costs **zero
dependencies**.

What was genuinely lost: Firestore's declarative security rules. Section 6
explains what replaced them.

### Three details in `openDb()` that matter

```ts
db.exec('PRAGMA foreign_keys = ON');
```
SQLite defaults foreign-key enforcement **off**, for backward compatibility with
decades-old database files. Without this line, `run_answers`' `REFERENCES
runs(id) ON DELETE CASCADE` is pure decoration.

```sql
) STRICT;
```
By default SQLite's type affinity is *advisory* — it will happily store the
string `"banana"` in an `INTEGER` column. `STRICT` makes that a hard error, which
turns the schema into an actual contract. It's also why the code writes
`answer.correct ? 1 : 0`: SQLite has no boolean type and a STRICT table rejects
one outright.

```ts
if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
```
Write-ahead logging lets readers and the writer work concurrently. Meaningless
for an in-memory database, so it's skipped in tests.

### Schema

```sql
countries      code (PK), name_en, name_fr, capital_en, capital_fr,
               capital_lon, capital_lat, continent,
               alt_capitals_en, alt_capitals_fr        -- JSON arrays

runs           id (PK), player_name, score, correct_count, best_streak,
               question_count, started_at, finished_at

run_answers    run_id (FK), position, code, chosen, correct, ms
               PRIMARY KEY (run_id, position)
```

Coordinates are separate `REAL` columns rather than a JSON blob, because they're
the only values worth querying on and a column is free.

`run_answers` is normalised even though per-country statistics are an explicit
non-goal. That's a deliberate, cheap departure: one extra table and one insert
loop preserves the ability to ask *"which capitals do I keep getting wrong"*
later without a migration. Throwing that detail into an unqueryable blob would
discard the main reason to prefer SQL here.

Writing a run inserts into both tables inside **one transaction**, so a failure
part-way cannot leave a run holding half its answers.

---

## 4. Repository layout

```
Capitales/
├─ .data/capitales.db          the database (gitignored)
├─ packages/
│  ├─ core/    PURE TypeScript — no DOM, no HTTP, no node:*, no Svelte
│  │           rng · types · i18n · localize · scoring · questions · game
│  ├─ geo/     d3-geo + TopoJSON → SVG path strings. No UI.
│  │           atlas (lookup by country code) · project (fitCountry)
│  ├─ data/    the Natural Earth ETL + the browser's fetch client. No SQL.
│  │           build-data · client · capitals.json · countries.topo.json
│  └─ ui/      Svelte components: CountryMap, Timer, AnswerButton,
│              Scoreboard, LanguageToggle
└─ apps/
   ├─ server/  the ONLY module that touches SQLite
   │           schema.sql · db · routes · server · seed
   └─ web/     Vite + Svelte 5, composes everything
```

The dependency direction is strictly one-way:
`apps/web → packages/ui → packages/{core, geo, data}`.

Two boundaries are load-bearing and a reviewer should reject anything crossing
them:

- **`packages/core` imports nothing** — not the DOM, not Svelte, not `node:*`,
  not the other packages. That's what makes the game rules testable with no
  browser, no server and no mocking.
- **`apps/server` is the only place SQL exists.** `packages/data/client.ts`
  speaks JSON over relative `/api` paths and doesn't even know a database is
  involved. Swapping the backend is a single-file change.

There is no build step for the workspace packages — they publish TypeScript
source via their `exports` field, and Vite and Vitest consume it directly. That's
the main reason this monorepo stays simple.

---

## 5. The data pipeline

`npm run build:data` is the only step that touches the network. Both outputs are
committed, so every later build and test run is fully offline.

**Source:** Natural Earth 50m, from the official `nvkelso/natural-earth-vector`
repository — `ne_50m_admin_0_countries.geojson` for shapes and
`ne_50m_populated_places.geojson` for capitals.

**Outputs:** `packages/data/capitals.json` (60 KB, 193 countries) and
`packages/data/countries.topo.json` (640 KB of TopoJSON geometry).

### Why 50m and not 110m

The lower-resolution 110m dataset yields only 163 playable countries. It omits
Singapore, Malta, Monaco, Vatican, Andorra, Liechtenstein and every Caribbean and
Pacific island state *outright* — they simply aren't in the file. 50m gives 193
countries for 640 KB, which is a one-time local load.

### Five traps in this data, all found the hard way

**1. The `-99` sentinel.** Natural Earth sets `ISO_A3` and `ISO_N3` to `-99` for
five entries, including **France and Norway**. Joining geometry to capitals on
an ISO field loses them silently — no error, they just never appear in a quiz.
Everything here joins on `ADM0_A3` instead, and a test asserts France survives.

**2. Johannesburg is tagged as a South African capital.** It isn't one. NE lists
four Admin-0 capital points for ZAF, and taking the first match would produce a
*wrong answer*, not merely an ambiguous one. `overrides.json` pins Pretoria, and
a test asserts Johannesburg never appears as an option.

**3. Two real countries have no capital in the dataset.** South Sudan (Juba) and
Nauru (Yaren) have no Admin-0 capital point at all. They're injected by
`overrides.json`. The ETL **throws** if it ever meets another sovereign country
in that state, rather than skipping it — skipping is how a country disappears
from a geography game and nobody notices for a year.

**4. Simplification destroyed Vatican City.** `topojson-simplify` prunes vertices
whose triangle area falls below a weight. Vatican's *entire polygon* covers
1.74e-8 steradians — four orders of magnitude below even a modest threshold — so
simplifying pruned every vertex and collapsed the ring to a single repeated
point. That produced a zero-area feature, which makes `fitExtent` compute a scale
of `0` and `geoPath` return `null`, so the country couldn't be drawn at all.
There is deliberately **no simplification step**; quantization alone takes the
file from 1360 KB to 640 KB, and simplifying only saved a further 9 KB. The trade
was a silently destroyed country for 1.4% of the file.

**5. Overseas territories live in the same feature as the mainland.** France's
geometry has 10 parts spanning 118° of longitude, from Guadeloupe to Réunion. Its
geometric centroid is a point in the **Atlantic Ocean**. Fitting the viewport to
the whole feature rendered metropolitan France as a handful of unrecognisable
specks. Section 7 explains the fix.

Ten entries typed `Country` are actually dependencies — Jersey, Guernsey, Isle of
Man, Åland, Aruba, Curaçao, Sint Maarten, Greenland, Hong Kong, Macao. All ten
lack an Admin-0 capital, so *"sovereign, and has a capital"* removes them for
free. That's deliberately preferred over a hand-maintained blocklist: the filter
derives from data the ETL already needs, so it can't drift out of date.

---

## 6. The API

Four endpoints on `127.0.0.1:8787`, served by Node's built-in `node:http`. No
framework — for four routes with no middleware, Express would be more machinery
than message, and Vite's dev proxy removes the CORS problem entirely.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/health` | `{ ok: true, countries: 193 }` |
| `GET` | `/api/countries` | all 193 records, every language |
| `POST` | `/api/runs` | `{ id }` — records one finished game |
| `GET` | `/api/leaderboard?limit=10` | highest scores first |

### The append-only guarantee

Firestore's `allow update, delete: if false` was four declarative lines. Here the
same property comes from something invisible: **there is no `PUT`, `PATCH` or
`DELETE` route anywhere.** A client cannot edit a past score because the verb
doesn't exist.

Because a guarantee enforced by *absent* code is invisible in a diff, the tests
assert the negative directly — POST a run, then try to `PUT` and `DELETE` it and
require `404`. A property enforced by missing code needs a test more than one
enforced by present code.

There is no authentication, deliberately. The server binds to `127.0.0.1` only,
so the sole client is the person sitting at the machine. A nickname is stored on
the run row and used for nothing but display.

### Error handling

The governing rule is **fail loud at boot, fail soft during play**:

| Failure | Behaviour |
|---|---|
| Server not running | A bounded probe of `/api/health` shows *"run `npm run server`"* within ~1.5s, not a blank screen. |
| Database not seeded | `/api/health` reports `countries: 0` → *"run `npm run seed`"*. |
| A country has no geometry | Dropped from the pool at boot with a console warning. |
| Saving a run fails | Score stays on screen, banner reports it, retry available. A finished run is never lost to a write error. |

---

## 7. Rendering the maps

`fitCountry(feature, capital, box)` returns an SVG path string, the capital's
pixel position, and the outline's pixel bounds.

It builds a `geoAzimuthalEqualArea` projection centred on the country, calls
`fitExtent` so the country fills the viewport, then draws the outline with
`geoPath` and places the dot with `projection(capitalLonLat)`. Because both go
through the **same projection instance**, they cannot drift out of sync.

Equal-area rather than Mercator, so Canada and Greenland aren't rendered
absurdly — Mercator distortion would also subtly leak difficulty cues.

### The capital-cluster fix

Given trap #5 above, the projection is fitted to the **landmass the capital
stands on**, plus everything chained to it within 8° great-circle distance.

Chaining rather than a flat distance filter is what keeps genuine archipelagos
whole: Okinawa connects back to Honshu through the Ryukyu islands in between. The
8° threshold was tuned against the whole dataset — it keeps Canada's arctic
archipelago, Indonesia's 133 islands, Japan and the Philippines intact, while
dropping France's Caribbean and Indian Ocean departments. Lowering it to 5°
starts chopping Canada; raising it to 12° pulls the Galápagos back into Ecuador.

The seed is the part that **contains** the capital, not the part whose centroid
is nearest. Nearest-centroid is the tempting shortcut and it's wrong: Moscow is
9.3° from Kaliningrad's centroid but much further from the centroid of the main
Russian landmass out in Siberia, so nearest-centroid would seed Kaliningrad and
render *that* as Russia.

### The most valuable test in the codebase

Twenty of the 193 capitals sit slightly *outside* their own outline at 50m
resolution — Lisbon, Stockholm, Beirut, Nassau and other coastal cities, by
0.3–3.8 km. So the frame is widened to include a capital up to 50 km outside.

That cap is what keeps the whole thing honest. Widening unconditionally would
mean **any** coordinate gets framed and looks plausible — including a transposed
`[lat, lon]` pair. At 50 km a genuine coastal offset is absorbed while a swapped
Paris, 6000 km adrift in the Indian Ocean, stays far outside the frame where the
test catches it.

`[lat, lon]` vs `[lon, lat]` produces code that runs perfectly and draws dots in
the wrong hemisphere. It's nearly invisible in review. Hence the rule: **all
coordinates in this codebase are `[lon, lat]`, GeoJSON order**, converted once at
the ETL boundary and never again.

---

## 8. Game rules

Ten questions, 15 seconds each.

Distractors are drawn from the **same continent** where possible. That's a
deliberate difficulty choice: *"Paris / Berlin / Madrid / Rome"* is a real
question, while *"Paris / Ulaanbaatar / Suva / Asunción"* gives the answer away.

**Scoring**

```
speedBonus = 100 × remainingMs / totalMs      0 at the buzzer, ~100 instantly
streak     = consecutive correct answers, including this one
multiplier = min(1 + 0.25 × (streak − 1), 2)  1, 1.25, 1.5, 1.75, then 2
points     = round((100 + speedBonus) × multiplier)
```

A wrong answer or a timeout scores 0 and resets the streak. Rounding happens once
per question, so the running total always equals the final score.

Four countries have more than one capital in the data. `overrides.json` names the
canonical answer and lists alternates that are *also accepted* if chosen:

| Country | Canonical | Also accepted |
|---|---|---|
| South Africa | Pretoria | Cape Town, Bloemfontein |
| Bolivia | Sucre | La Paz |
| Côte d'Ivoire | Yamoussoukro | Abidjan |
| Myanmar | Naypyidaw | — |

---

## 9. The state machine

```
idle → loading → ready → question ⇄ revealing → … → finished → submitting → leaderboard
                                                                     ↘ error
```

`revealing` is a ~1.2 s beat showing which option was right — the part that makes
a quiz feel like a game rather than a form.

Two rules make it testable, and both are worth keeping:

**The reducer never calls `Date.now()`.** Events carry the timestamp; state holds
`questionStartedAt`. *"Answered with 3 ms left"* is an ordinary unit test rather
than a timer-mocking exercise.

**Countdown ticks are not state transitions.** Remaining time is a derived value
computed from `questionStartedAt`; only actual expiry dispatches `TIMEOUT`.
Routing every tick through the reducer would mean 15 state updates per question
and a re-render storm.

One caveat learned the hard way: the reveal timer and the question timer are
driven by **one interval with one advance path**. Scheduling the reveal from the
click handler alone left the game permanently stuck whenever a question timed out
instead of being answered — nothing was left to dispatch `REVEAL_DONE`.

---

## 10. English and French

Both languages come free from the ETL: Natural Earth carries `NAME_FR` for every
country and every Admin-0 capital, with zero gaps.

The API returns **every language at once**, and `localize(record, lang)` collapses
a record to the monolingual `Country` the game logic already used. That means
question generation, distractor selection, answer matching, scoring and the
reducer are entirely untouched by localisation — and switching language is a
re-map of ~193 objects already in memory rather than a round trip.

French alternates are resolved *from the dataset* rather than hand-translated, so
Cape Town → **Le Cap** falls out automatically. The ETL throws if an override
names a city the dataset doesn't list.

62 of 193 capitals genuinely differ: Brussels → Bruxelles, Beijing → Pékin,
Ulaanbaatar → Oulan-Bator, Juba → Djouba.

The toggle persists to `localStorage` and defaults from the browser's language.
**Switching restarts the run** — deliberately. Swapping labels mid-question would
change the four options under your cursor, and a run scored half in one language
and half in another is not one run.

Interface strings live in `packages/core/src/i18n.ts` as a flat typed record.
With two languages and ~24 keys, an i18n framework would be more machinery than
message; typing it as `Localized<Record<MessageKey, string>>` makes a missing
French translation a *compile error* rather than a blank label.

---

## 11. High scores

A finished run only asks for your name when the score **actually beats the tenth
entry**. Otherwise it shows the board read-only. Being asked for a name is the
reward, so asking every time would cheapen it.

Ties do **not** qualify once the board is full — replaying the same score would
otherwise churn the bottom entry forever without ever being an improvement. A
zero score never qualifies, however empty the board.

If the server is unreachable at that moment, the score stays on screen and the
run simply goes unsaved. A network failure must never cost you your result.

---

## 12. Testing

**160 tests, one `npm test`, nothing to start first.**

That last part is a direct benefit of the SQLite choice: the API tests start the
real server in-process on an ephemeral port against a `:memory:` database and
drive it with plain `fetch`. No external process, no fixture files, no cleanup —
every test file gets a pristine database for free.

| Area | What it covers |
|---|---|
| `core` | Seeded RNG determinism, question generation, scoring boundaries, the full reducer, localisation, the top-10 rule |
| `geo` | Cluster selection, projection fitting, and the swapped-coordinate guard |
| `data` | `capitals.json` integrity — count, sorting, coordinate ranges, both languages, every override, the geometry join |
| `server` | All four endpoints, malformed bodies, and the append-only guarantee |

The seeded RNG is what makes this work: the same seed yields the same ten
countries in the same order with the same option ordering, so *"the quiz is
random"* and *"the tests are deterministic"* are both true.

---

## 13. Accepted limitations

**The client knows the answers.** `/api/countries` returns capital names and the
browser fetches all 193 at boot, so the correct answer is in memory before you
click. The score is also computed client-side; the server records what it's told.

Both are accepted deliberately. Closing either would mean the server holding the
questions and grading answers — substantial complexity for no benefit in a local
single-player game where the only person who could cheat is the person who wants
to play.

**Micro-states are hard.** Vatican City is 1.1 km wide. It renders correctly and
its marker is visible, but recognising it is genuinely difficult. That's a
feature, arguably.

---

## 14. What isn't built yet

The design covers three shells over one shared core. Only the first exists:

- **`apps/web`** — done, the desktop-browser layout
- **`apps/mobile`** — planned, touch-first layout over the same components
- **`apps/desktop`** — planned, an Electron window wrapping `apps/web/dist`

Also planned: a Playwright end-to-end suite. Deliberately out of scope: region
and difficulty selection, spaced repetition, and a review-your-mistakes screen.

The full design document and the implementation plan live in
`docs/superpowers/`.
