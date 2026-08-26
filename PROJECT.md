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
| `npm run dev:desktop` | Builds and launches the Windows app. |
| `npm run package:win` | Windows: installer **and** portable executable. |
| `npm run package:linux` | Linux: tar.gz archive. |
| `npm run build:single` | The whole application as one 875 kB `index.html`. |
| `npm run package:android` | APK, named after the manifest version. |
| `npm run icons` | Regenerates the icons from the SVGs. |
| `npm run build:data` | Re-runs the Natural Earth ETL (rare; outputs are committed). |
| `node scripts/build-portraits.mjs` | Re-encodes the credit portraits from `assets/portraits/`. |
| `npm test` | The whole suite — 240 tests, nothing to start first. |
| `npm run typecheck` | `tsc --noEmit` across every package. |
| **`npm run verify`** | **The actual gate**: typecheck, tests, and both builds. |

### Why `verify` builds instead of stopping at the tests

`tsc` does not read the `<script>` block of a `.svelte` file. The official
checker, `svelte-check`, refuses TypeScript 7 at startup — not merely at install
time, and not persuadable with `--legacy-peer-deps`. **The bundler is therefore
the only thing that type-checks the components**, and it did catch a dead import
that would otherwise have shipped.

Hence `verify`, which chains all four steps. It is what to run before building
anything, and it caught half the faults in this project.

That gap cost three bugs, none of them visible to `tsc` or to the tests:

| Symptom | Cause | What caught it |
|---|---|---|
| Broken build, `MISSING_EXPORT` | A component imported a deleted constant | `build:single` |
| A loss printed as `+-15` | A `+` hard-coded in the markup | A player |
| A link at twice the right size | `font: inherit` overriding `.mono` | A player |

The answer adopted is to **move the rule out of the component** the moment it is
testable: `formatPoints` lives in `core` with its tests, and so does the
seven-press logic. What stays in a `.svelte` file is markup and CSS, and scoped
CSS is still covered by nothing.

---

## 2. Where the SQLite file is

Two locations, depending on how you run it:

| How you run it | Database |
|---|---|
| `npm run server` / `npm run dev` | `.data/capitales.db` in the repository, gitignored |
| The installed or portable Windows app | `%APPDATA%\Capitales\capitales.db` |
| The Linux tarball | `~/.config/Capitales/capitales.db` |

They are separate files, so a run played in the browser does not appear on the
desktop app's leaderboard. Development state and the real app's state stay apart
on purpose.

The rest of this section is about the development one.

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
│              Scoreboard, LanguageToggle, Wordmark
└─ apps/
   ├─ server/  the ONLY module that touches SQLite
   │           schema · db · routes · host · server · seed
   ├─ web/     Vite + Svelte 5, composes everything
   └─ desktop/ Electron shell for Windows and Linux; hosts the server
               in its own process
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
same property comes from something invisible: **there is no `PUT` or `PATCH`
route, and no route addresses an individual run.** A client cannot edit a past
score because the verb doesn't exist.

Because a guarantee enforced by *absent* code is invisible in a diff, the tests
assert the negative directly — POST a run, then try to `PUT` and `DELETE` it and
require `404`. A property enforced by missing code needs a test more than one
enforced by present code.

**The guarantee was narrowed, not dodged.** The player can now empty a whole
board from the high-scores screen, which took the API's only destructive route:
`DELETE /api/leaderboard?mode=…`. A board nobody can reset eventually stops
being interesting — one lucky run sits at the top for ever.

What survives, and what the tests pin down, is that **no route can reach one run
and alter it**. The game adds to history, the player can discard all of it, and
nothing anywhere can quietly retouch a single line. The delete is scoped to one
mode: naming and placing are separate boards, the player is looking at exactly
one of them, and wiping the other in passing would be a shock. `run_answers`
goes with it through `ON DELETE CASCADE`, which only bites because `openDb`
turns foreign keys on — a test checks the rows themselves rather than what the
route claims.

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

## 8b. The two modes

`name` is the original 1996 game: pick the capital from four cities. `place`
shows the country and names its capital, and asks you to put the marker where
that city is.

**The title screen never became a menu.** Its headline already described the
mode — "Name the capital." / "One outline. One marker. Four cities." — so the
selector rewrites those lines rather than adding an explanation beside them.
The hero previews the mode too: a marker to read in `name`, a bare outline
waiting for one in `place`. The screen changes; it does not grow.

The selector reuses the language toggle's shape deliberately. Two settings that
look alike behave alike, and the second one needs no learning. The choice is
remembered in `localStorage`, so a returning player is one click from playing.

The rule worth keeping: **one primary action and at most one row of choices.**
Difficulty or regions, if they ever arrive, become a second row of that same
control or they do not arrive.

### Scoring a placement

```
reach    = distance from the capital to the furthest corner of the frame
target   = max(25 km, 0.15 * reach)           radius of the red circle
zero     = 2 * target                         nothing at all past this
distance = haversine(drop, capital)           great-circle kilometres
accuracy = 1 if distance <= 25 km
         = 1 - (distance - 25) / (zero - 25)  down to exactly 0 at the zero ring
points   = round((100 + speed) * accuracy * multiplier)
           speed counts ONLY if the drop landed in the target
         = -round(100 * progress towards the corner)   past the zero ring
```

**This scale got it wrong three times, and playing found every one of them.**

The first version used `sqrt(1 - d/2500)`: far too kind, every run landed in the
same band. The second moved to exponential decay with negative points beyond
1500 km — but the map shows one country, and **the furthest corner of the French
frame is 1116 km away**: the threshold sat off screen, unreachable in 157 of 193
countries. The third fixed the frame of reference by working in fractions of the
map's reach. A subtler fault survived, and measurement is what showed it.

#### What knowing nothing used to pay

| Strategy | Before | Now |
|---|---|---|
| Click the centre of the frame, instantly | **1111** | 606 |
| Click the country's centroid | 1105 | 616 |
| Click at random in the frame | 342 | 13 |

Eleven hundred points without knowing a single capital. Two causes:

**Exponential decay never reached zero.** There was always a little something to
collect for a drop that was not an answer, and small change of exactly that kind
is what a guesser lives on. The curve now falls in a straight line to **exactly
zero** at twice the target radius — 83 km around Bern. Past it, points go
negative.

**The clock was paying for shrugs.** Answering instantly was worth points even
when the drop was placed anywhere at all, so clicking early beat thinking. The
speed bonus is now paid **only when the drop lands in the target**. Answering
fast is still a way of showing you knew; it is no longer a substitute for
knowing.

Checked directly: a precise but very slow player scores **1499**, a sloppy but
instant one **357**. Speed can no longer beat precision.

#### What remains, and why it is correct

Centre-clicking still pays 606. Measured across all 193 countries, that gesture
produces a mean error of **24.9% of the frame** — which is exactly the accuracy
of an honestly mediocre player. The trick does not beat an average player by
cunning: it *is* an average player, because capitals really are often central.

Tightening further was tried and rejected on the measurements. A falloff exponent
of 1.75 drops the trick to 502, but also drops a good player from 1838 to 1609:
the trick-to-good-player ratio does not move (0.33 against 0.31). No curve can
tell "25% out because I clicked the middle" from "25% out because I roughly
knew". Tightening would only punish honest players, so it was not kept.

| | Vatican | Switzerland | France | Canada | Russia |
|---|---|---|---|---|---|
| Frame reach | 2 km | 278 km | 1116 km | 5977 km | 7788 km |
| Target (15%) | 25 km | 42 km | 167 km | 897 km | 1168 km |
| Zero (2x target) | 50 km | **83 km** | 335 km | 1793 km | 2337 km |
| -100 at the corner | — | 278 km | 1116 km | 5977 km | 7788 km |
| Accuracy at 200 km | 100% | **0%** | 33% | 80% | 85% |

The 83 km around Bern came from a played example, not a formula. The rule fits in
a sentence: **outside twice the target, nothing; at the corner of the map, minus
a hundred.**

A 25 km floor protects the micro-states: the Vatican's frame is two kilometres
across, and without it "on target" would mean 300 metres.

Placing nothing at all costs the full -100. The penalty deliberately ignores the
streak multiplier — a player on a good run should not be punished harder than one
having a bad run.

| Profile | Total score |
|---|---|
| expert (3% out) | 2826 |
| good (10%) | 1838 |
| average (25%) | 430 |
| weak (45%) | **-33** |

A perfect instant drop on a maxed streak is still worth 400, exactly like a
perfect instant naming answer.

#### The test that was missing

No unit test could have caught the frame-of-reference error, and it is the most
useful lesson in the project. `packages/core` deliberately knows nothing about
geometry: it does not know how much world is on screen, so it could not know its
threshold was outside the frame. `packages/geo` knows the frame but not the
scale. **The bug lived in the gap between two packages that were both correctly
tested.** The test therefore lives in `geo`, imports `missDistanceFor` from
`core`, and sweeps all 193 real countries.

### Two summaries, because they are two games

The results screen said "8 of 10 answered · best streak 5" in both modes. In
placing that is simply wrong: you answered all ten, and eight was the number of
drops that landed on target. Worse, the statistic that describes a placing run
— how far off you were — appeared nowhere.

Placing now leads with it: **"average error 499 km · 4 / 10 on target"**.
Timeouts are left out of the average rather than counted as some invented huge
distance, which would swamp it with a number the player never chose.

Best streak left that summary and stays with naming. The two numbers that
describe a placing run are the average error and the count that landed in the
target; a third, about runs of those, is noise on a line already doing enough
work. The `xN` multiplier stays on screen during play, where it earns its
place.

**The leaderboards are separate.** Naming and placing are different skills on
different curves; one board mixing them would rank nobody meaningfully. The
`runs` table gained a `mode` column and the index leads with it, since the board
is always asked for one mode at a time.

### Two things this uncovered

`fitCountry` now returns `project` and `unproject` alongside the path. A click
goes back through **the very projection that drew the outline**, so the guess is
measured in the space it was made in — the same reason the outline and the
marker cannot drift apart. A test asserts the round trip for all 193 countries.

Adding the `mode` column also shipped an index over it, and `CREATE TABLE IF NOT
EXISTS` does nothing to a table that already exists — so on every database
created by an earlier build, `openDb` threw `SQL logic error` before the server
could start. Indexes are now applied *after* the missing-column step, and a test
opens a deliberately old database to prove it. The in-memory databases every
other test uses always have today's schema, so none of them could ever have
caught it.

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

## 11b. The easter egg

Seven presses on the logo, each within two seconds of the last, open a credits
screen: three faces, what each of them did, and the way out.

### Why a gesture and not the Konami code

The obvious answer is ruled out immediately: **the APK has no keyboard.** A press
is the one input a mouse, a finger and a stylus all produce identically, so seven
presses give a single code path across the five builds instead of one per input
device. It is also the idiom Android uses for its build number, which gives
someone poking at the logo a chance of finding it.

The counting rule lives in `packages/core/src/easter.ts`, with its tests. A press
arriving after the window has lapsed **starts again at one** rather than doing
nothing: a hesitant player restarts instead of being silently punished. A test
walks forty presses spread across a session to prove that idle clicking on the
logo can never add up to the secret.

The only tell arrives on the fourth press: the brass bead in the logo widens its
halo. Enough that someone already pressing knows they are heard, nothing at all
to someone who pressed once.

**The logo does not become a button.** It does nothing a keyboard user needs, and
a silent tab stop in the header would cost every visitor something to hide a joke
from most of them. The trigger is also inert outside the title screen: tapping
the header mid-question must not pull the player away from their map.

### A separate room

The screen hides all the chrome — wordmark, language toggle, rule, footer. A page
you have to knock seven times to reach should feel like a different room, not the
same room with a panel swapped in. What is left is one face, what that person
did, three dots and the way out — and the way out wears the same brass button as
the title screen, because with no header it is the only one there is.

**French only, and that is a decision.** The captions run on puns — *aspirateur*
against *inspirateur*, *con sultan* out of *consultant*, a chain of electrical
senses of *branché*, *au courant* and *pile* — and every English rendering was a
translation of a joke rather than a joke. The rest of the game stays bilingual;
this page is a private one, in the language it was written in. The EN/FR toggle
disappears with the rest of the chrome partly because it would be lying.

**Nothing advances by itself.** A six-second rotation sounds friendly and is not:
two of these captions take longer than that to read, so the screen kept pulling
the text away mid-sentence. The dots grew to a 26px target now that they carry
all the navigation alone.

### Swiping, for the phone

On the APK a horizontal swipe moves through the faces, wrapping in both
directions. **Pointer events** rather than touch events: a finger, a stylus and a
mouse drag all go through one handler instead of three code paths.

The decision — swipe, or tap, or scroll? — lives in `credits.ts` as `swipeFrom`,
where it is tested. Two gestures have to be ruled out:

- **A tap** moves a few pixels; 40 are needed to count.
- **A scroll** travels further down than across. Requiring the horizontal travel
  to beat the vertical is what stops a thumb sliding down the page from flicking
  through the credits on its way past.

A finger moving left brings the next face in, the way a page does.

Two details that look like nothing:

`touch-action: pan-y` on the container claims horizontal drags and leaves
vertical ones to the page. Without it, **Android hands the sideways flick to its
own back gesture** and the credits never see it.

A `pointerup` inside the bubble still fires a `click`. A swipe ending on the face
would therefore advance twice — a `swiped` flag swallows that one click.
Keyboard activation never raises it, so Enter on the focused bubble still works.

The heading changes with the face — made, motivated, coded — because a shared
title would have needed a sentence to say what one word says three times.

### The portraits

`assets/portraits/` holds the sources; `scripts/build-portraits.mjs` crops them
square, scales them and writes `packages/ui/src/portraits.ts`.

**Data URIs**, not files: the APK and the single HTML file have nowhere to fetch
from, and a credits screen that needs a server is not a credits screen.

256 pixels rather than 160: the bubble is drawn at about 132 CSS pixels and a
phone puts two or three real ones in each of those, so a 160 source would arrive
visibly soft on the platform most likely to see it. As WebP the three come to
**37.6 kB**, which is +56.6 kB once base64'd — the single-file build goes from
818 kB to 875 kB.

The crop is set per photo rather than centred: Philippe's joke is the shrub above
his head and the north edge keeps it, and Claude's portrait puts the face high in
the frame, without which it would be a picture of folded arms.

A test checks that every portrait actually begins `data:image/webp;base64,` and
runs past two kilobytes. That is what would notice a missing source file before a
build shipped a blank disc.

---

## 12. Testing

**240 tests, one `npm test`, nothing to start first.**

That last part is a direct benefit of the SQLite choice: the API tests start the
real server in-process on an ephemeral port against a `:memory:` database and
drive it with plain `fetch`. No external process, no fixture files, no cleanup —
every test file gets a pristine database for free.

| Area | What it covers |
|---|---|
| `core` | Seeded RNG determinism, question generation, scoring boundaries, the full reducer, localisation, the top-10 rule |
| `geo` | Cluster selection, projection fitting, and the swapped-coordinate guard |
| `data` | `capitals.json` integrity — count, sorting, coordinate ranges, both languages, every override, the geometry join |
| `server` | All five endpoints, malformed bodies, the append-only guarantee, and clearing a board |

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

## 14. Distribution

```bash
npm run dev:desktop      # build and run it
npm run package:win      # Windows installer  -> apps/desktop/release
npm run package:linux    # Linux tarball      -> apps/desktop/release
npm run icons            # re-render icons from the SVGs
```

`npm run package:win` produces two files, both about 101 MB — Electron's floor,
since each carries a whole Chromium:

| File | What it is |
|---|---|
| `Capitales-0.0.0-setup.exe` | Installer. Adds a Start-menu shortcut and an uninstaller, and lets you pick the install directory. |
| `Capitales-0.0.0-portable.exe` | **No installation.** Double-click and it runs. Nothing is added to the Start menu and there is nothing to uninstall — delete the file and it is gone. |

The portable build unpacks itself to `%TEMP%\Capitales-<version>\` on first
run and reuses that folder afterwards, rather than re-extracting 100 MB each
time.

It still keeps its database in `%APPDATA%\Capitales\`, not beside the
executable. That is deliberate: a portable app is often run from a USB stick or
a read-only share, and writing next to the binary would fail there. The
trade-off is that "portable" here means *no installation*, not *no trace* —
your high scores survive deleting the exe, and follow you if you replace it
with a newer one.

**The server runs inside the Electron main process**, not as a spawned child.
That is only possible because `apps/server` is a plain Node module with no
browser dependency, and it buys three things: one process to supervise, no port
negotiation with a child, and no orphaned server if the window is killed.

That same server also serves the built web assets, so the renderer talks to a
single origin and the client's relative `/api` paths work with no proxy and no
CORS — exactly as they do behind Vite in development. The port is `0`, meaning
the OS picks a free one, so the app never collides with a running dev server.

Three details that would each have broken the packaged build:

**The database goes in `%APPDATA%\Capitales\`**, never beside the executable.
An installed app cannot write next to its own binary, and anything in the
install directory is wiped by the next update — taking the high scores with it.

**The app seeds itself on first launch.** There is no terminal to run
`npm run seed` from, so `capitals.json` is bundled and planted if the countries
table is empty.

**The schema is a TypeScript string, not a `.sql` file.** The main process is
bundled to CommonJS, where `import.meta.url` is empty, so resolving a sibling
file at runtime returned the wrong path and crashed on startup. Inlining it
means the schema travels with the code in every build.

Electron rather than Tauri: Tauri would produce a ~5 MB installer instead of
~101 MB, but it needs the Rust toolchain and MSVC Build Tools, several GB that
this machine does not have. The shell owns no game logic, so switching later is
a contained change.

**Touch.** The layout folds to one column below 940px, and below that the map
gets the flexible row while the answers keep their natural height — without that
the map collapsed to 205px on a phone. Measured on a 375×812 screen it is now
329px, 41% of the viewport.

The original design said "map top ~55%", which the arithmetic does not allow:
four 60px tap targets plus their gaps are 266 incompressible pixels, so ~41% is
the honest ceiling. What bought the extra 124px was removing rows that earn
their place on a desktop and not on a phone — the section eyebrow that repeats
the question below it, the caption labelling a dot that needs no label, and a
footer that is empty outside the title screen.

On coarse pointers the A–D key badges are hidden, since they advertise a
keyboard that is not there, and hover states give way to an `:active` press.
`env(safe-area-inset-*)` keeps the frame clear of notches and gesture bars.

The two-column leaderboard is gated to screens at least 560px wide: it exists to
reclaim *vertical* space on a short laptop window, and on a 360px phone two
columns of names overflowed horizontally by 49px.

### The single-file build

```bash
npm run build:single    # -> apps/single/dist/index.html, one file, 780 KB
```

Double-click it. It opens in whatever browser is already installed, on Windows,
Linux, macOS or a phone. Nothing to install, nothing to uninstall, and it can be
emailed as an attachment.

**Why it is 130× smaller than the executable.** The application itself is only
1637 KB built; the other 99.7 MB of the installer is Chromium. This build ships
no runtime at all and borrows the browser the machine already has.

Getting from 1637 KB to 780 KB is almost entirely fonts: the bundled web fonts
are 879 KB, and inlining them would mean base64, costing a further third on top.
This build uses system font stacks chosen to keep the typographic character —
a humanist UI face, a real italic serif for the display line, a technical
monospace — all of which ship with Windows, macOS and mainstream Linux.

**How the storage swap works.** `packages/data-local` exports exactly the three
functions `apps/web` imports from `@capitales/data` — `loadCountries`,
`saveRun`, `topScores` — backed by the bundled country data and `localStorage`.
`apps/single/vite.config.ts` aliases one onto the other, so not one line of the
game, the UI or the store knows which it got, and no code that talks to a server
reaches the bundle. That substitution is only possible because nothing above
that layer ever knew a database existed.

The alias is anchored with `/^@capitales\/data$/` rather than a bare string: a
plain string alias also matches the prefix of `@capitales/data/capitals.json`
and rewrites that subpath onto the replacement file.

**Verified at a real `file://` origin**, not merely over HTTP: the inline module
executes, `localStorage` works, a full ten-question round plays through, and a
claimed score persists across reloads.

**What it gives up:** SQLite, and a leaderboard shared between browsers. Scores
live in that browser's `localStorage` — per browser, per machine.

The name-entry box on the results screen sized itself to its contents — input,
button and padding — and simply overhung a narrow screen, carrying the Save
button off the edge. `.results` centres its children rather than stretching
them, so nothing was constraining the width. It now has `max-width: 100%`, the
input can shrink (`min-width: 0`, which a text input otherwise refuses to do),
and below 480px the field stacks above the button, which is a better tap target
that way anyway.

This one is worth remembering as a testing lesson rather than a CSS one. The
earlier sweep across 360×640 reported no overflow because the leaderboard was
full, so the run did not qualify and **the box never rendered**. Only a first
run on an empty board reaches that branch. Measuring a screen is not the same as
measuring its states.

### Android

```bash
npm run package:android   # -> apps/android/release/Capitales-debug.apk, 4.5 MB
```

**Capacitor**, wrapping the app in Android's WebView. Same principle as the
single-file build and for the same reason: the phone already has a rendering
engine, so the APK does not carry one. That is why it is 4.5 MB rather than
Electron's 101 MB.

**`webDir` points at `apps/single/dist`.** The Android app has no bundle of its
own: the single-file build already carries the geometry, the country data and
the styles, and already keeps scores in `localStorage`, which is exactly what a
WebView provides. So the mobile app needs no data layer, no server and no
SQLite plugin — the work that made one HTML file self-sufficient is the same
work an offline mobile app needs.

**Two JDKs.** Gradle refuses to start on a JVM newer than it understands. This
machine's system Java is 25, Gradle 8.14 stops at 24, and the message is the
memorable `Unsupported class file major version 69` — 69 being Java 25, in a
table that runs 65 = Java 21 through 69 = Java 25. Android Studio's own bundled
JDK is 25 as well and is no help: that one runs the IDE, not Gradle. So a JDK 21
is installed alongside, and `build-apk.mjs` finds a JDK in the supported range
and uses it for this build only, leaving the system default alone.

**Icons.** Android wants an adaptive icon — a transparent foreground layer the
launcher masks and parallaxes over a background colour — plus legacy square and
round icons for older launchers. `apps/android/make-icons.mjs` renders both from
SVG, using the simplified drawing below 96px for the same reason the desktop
build does. The marker sits inside the inner safe zone, since launchers crop
into the outer quarter of an adaptive icon.

**One caveat, stated because it is untested.** The manifest still declares the
`INTERNET` permission that Capacitor adds by default. The game never makes a
network request, so it ought to come out — but Capacitor serves its assets
through a local interceptor, and confirming that removing it does not stop the
app from launching needs a real device, which was not available here. To try it,
delete the `uses-permission` line from
`apps/android/android/app/src/main/AndroidManifest.xml`, rebuild, and install on
a phone. If the app opens, the permission was not needed.

The APK is a debug build, so it is signed with the throwaway debug key: fine for
sideloading onto your own phone, not for distribution.

**`apps/android/android/` is gitignored.** It is generated by `npx cap add
android`; the sources are `capacitor.config.ts`, `assets/` and the two scripts.
Regenerate it with `npx cap add android` from `apps/android`.

### Linux

`npm run package:linux` produces `Capitales-0.0.0-x64.tar.gz`: extract it and
run `./capitales`. The archive carries everything, fonts included, so the Linux
build is as offline as the Windows one.

**AppImage and .deb cannot be built on Windows.** AppImage needs `mksquashfs`
and electron-builder looks for it under a `darwin/` path when invoked from
Windows; `.deb` needs Debian packaging tools. Both work from a Linux machine,
WSL, or Docker — the targets are already configured, so
`npm run package:linux:all` builds all three there. On Windows the default
script asks only for `tar.gz`, which builds anywhere, rather than failing.

The Linux executable is named `capitales` explicitly. Left to itself
electron-builder derives it from the package name and produces
`@capitalesdesktop`, which AppImage rejects outright.

### Icons

`apps/desktop/assets/icon.svg` is the survey marker — the same motif the game
paints on every capital. There is a second drawing, `icon-small.svg`: below
48px the graticule turns to mud and the ticks vanish, so the small sizes come
from a simplified version with a heavier ring and a larger dot. `make-icons.mjs`
picks the right source per size and emits `icon.ico` (7 sizes), a 512px
`icon.png`, and a themed `icons/` directory for Linux.

The rendered files are committed even though they are generated. Regenerating
them needs `sharp`, a native rasteriser, and making every build install that for
100 KB of PNG is a bad trade — the same reasoning that keeps the ETL outputs in
the repository.

## 15. What isn't built yet

- A Playwright end-to-end suite
- **Code signing.** Neither Windows build is signed, so SmartScreen warns on
  first run. Signing needs a certificate, which costs money.
- **AppImage and `.deb`**, which are configured but need a Linux machine, WSL or
  Docker to actually build (§14)

**`apps/mobile` was dropped**, not forgotten. The original design called for a
separate touch-first shell as the third variant. The responsive work done to fit
the app into a laptop window absorbed most of it: measured at 375×812, the
layout folds to one column with zero overflow, all four answers stay above the
fold, and the buttons are 56px tall — above the 44px accessibility floor. A
fourth package would now duplicate a layout that already works.

What a touch pass would still add, as refinements to `apps/web` rather than a
new app: a taller map (205px on a phone is cramped), hiding the A–D key badges
where there is no keyboard, dropping hover states, and safe-area insets for
notched screens.

Deliberately out of scope: region and difficulty selection, spaced repetition,
and a review-your-mistakes screen.

The full design document and the implementation plan live in
`docs/superpowers/`. A French version of this document is in `PROJET.md`.
