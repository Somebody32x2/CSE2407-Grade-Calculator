# CSE 2407 Grade Calculator

A grade calculator for CSE 2407 (Data Structures and Algorithms), which is
graded on learning goals rather than percentages. Enter a rating for each
assessment and it works out the subgoal ratings, the learning goal ratings, the
point total and the letter grade — and tells you which work can still change
it.

It also imports your grades from Canvas and Gradescope, so you do not have to
transcribe ninety-odd assessments by hand.

**Unofficial.** Your instructors hold the real grades. This is an estimate
built from the published grading scheme, and where the two ever disagree,
theirs is right.

## Running it

No build step, no dependencies.

```sh
npm start        # http://localhost:8080
npm test         # 140 tests
```

`npm start` runs the small Node server in `server/`, which serves the page and
the grade-import relay. The page works opened straight from disk too; only the
import needs the server.

## How the grade works

| | |
|---|---|
| **P** Proficient | 2 points |
| **D** Developing | 1 point |
| **S** Starting | 0 points |
| **A** Application (exam) | 4 points |
| **B** Baseline (exam) | 3 points |
| **T** Attempted (exam) | 1 point |

Nine learning goals at 2 points each, three exams at 4 each, and up to 2 more
for Special Topics: **32 points** in total. Points map straight to letters, 30
and above being an A+ down to 20 for a D, and anything below 20 an F. If you
are taking the course Pass/No Pass, C− (22 points) is the lowest passing grade.

Ratings aggregate upward:

- **A subgoal** takes the *second-highest* rating among its assessments — so
  one bad grade among several does not sink it. A subgoal with a single grade
  takes that grade; one with none counts as P.
- **Subgoals of LG 0** are the exception: they take the *second-lowest* rating.
  Professional skills have to hold up across the semester, not just twice. Miss
  one studio and your Collaboration rating holds; miss two and it moves.
- **A goal's global assessments** (its zyBooks reading) take the *lowest*
  rating, except that an S is relaxed to a D.
- **A learning goal** is the highest level *every* subgoal and its global
  assessment reach. Any S anywhere drops the whole goal to S.
- **LG 0 gates the A range.** 28, 29 and 30 points earn A−, A and A+ only if
  LG 0 is P. Otherwise the grade stops at B+ however many points you have.

zyBooks is entered out of 10: 9.0 and up is P, 7.0 to 8.9 is D, below 7.0 is S.
Canvas marks it out of 100, which is the same rule at 90% and 70%.

Everything starts at **S**, so a fresh calculator reads 0 / 32 and an F. The
total only climbs as real grades arrive, which is easier to read than a
projection that drifts downward.

## Reading the bar

The hero is the points themselves — one slot each, grouped by what fills them:
nine learning goals worth 2 apiece, three exams worth 4 apiece, then Special
Topics worth 2.

Each source fills **its own** slots, so a goal that earned nothing shows two
empty cells rather than borrowing fill from further along the bar. The gaps mark
exactly where points were lost.

The ruler underneath measures totals rather than sources: it marks where each
letter starts, and strikes out A−, A and A+ whenever LG 0 is not P. That is the
gate rule — you can hold those points and still not have the grade.

Dark mode is blue-accented: chrome, focus rings and exam points read blue, while
P / D / S stay green / amber / red, since those are status colours and should
not move with the theme. Light mode uses a green accent.

## What still matters

A subgoal cannot go above P. So once a subgoal reaches P, the assessments
feeding it can no longer raise your grade however well you do them — and with
second-highest scoring, a subgoal reaches P as soon as **two** of its
assessments do. That leaves real work on the table worth exactly nothing, and
the grade table gives you no way to tell which work that is.

Each assessment row is flagged:

- **`counts in 3.1 and 3.2`** — one grade feeding two subgoals. Nine
  assessments do this and their names say so: "MCQs: Analysis (LG 2.1, 2.2)".
- **`also 0.3`** / **`also 0.4`** — the same piece of work is graded again under
  a different id, on a different axis, in another goal. Every program writeup is
  marked for content in its own LG and for typesetting in LG 0.3; every studio
  is marked for content in its LG and for participation in LG 0.4. The chip
  turns green when that other half can still raise your grade.
- **`no gain`** — every subgoal this assessment counts in is already at P, so
  raising it changes nothing. The row dims.

The two together are the useful bit. `Week 4 Studio (LG 3.1)` may show
`also 0.4, 3.2` and `no gain`: the studio cannot help LG 3.1 any more, but
turning up still counts for Collaboration. `Knowledge Check (LG 3.1)` showing
`no gain` with no `also` chip is genuinely spent.

A line above the list totals it up, and **Hide what can't change the grade**
strips those rows so what is left is only work that still pays.

## Importing grades

Drag the **CSE 2407 grab grades** button from the app to your bookmarks bar,
then click it while you are on your Canvas grades page or your Gradescope course
page. It reads the grade table; the calculator picks it up within a few seconds
and records what it came from and when.

Given the bookmarklet runs on a different origin, it gets the data across one of
two ways:

1. It POSTs to `/api/sync/<token>`, where `<token>` is a random value your
   browser generated and only your browser knows. Your open calculator tab polls
   for it, takes it, and the server forgets it immediately.
2. If your school's Content-Security-Policy blocks that upload, it instead opens
   the calculator with the data in the URL **fragment**. Browsers never send
   fragments to a server, so that path never leaves your machine.

It reads the rendered page and nothing else — no cookies, no login session, no
other tab — and sends only assignment names, Canvas assignment ids and scores.

Matching is by Canvas assignment id first, which is unique for every assessment,
then by exact name, then by name plus LG tag (Canvas splits
"Knowledge Check (LG 4.2)" where the course data keeps "(LG 4.1, 4.2)").
Anything it cannot match is listed rather than guessed at.

### Run it on both, in any order

The two sources do not cover the same ground and do not mark at the same time —
Gradescope often has a result days before Canvas, and Canvas carries plenty
Gradescope never sees. So each import is **merged** into what you already have,
and the app notes where every rating came from. Each row shows its source, and
the import panel lists each source with its own "last updated" time.

Which reading wins is decided by how good the evidence is, not by which arrived
last:

| Reading | Weight |
|---|---|
| An actual score or letter | **marked** — authoritative |
| "No Submission" | **absent** — true only as far as that page knows |
| "Submitted", "Ungraded", blank | **nothing** — never written |

Better evidence always wins; between two equally good readings the more recent
scrape wins. That gives the right answer in each awkward case:

- Gradescope marks something, then Canvas shows it still ungraded → the mark
  stands.
- Gradescope shows "No Submission" for work Canvas has already marked → the
  mark stands. This matters because Gradescope reports an *unfilled
  resubmission slot* as "No Submission"; without this rule, importing
  Gradescope would wipe grades.
- A resubmission that has actually been graded → replaces the original, because
  it is the latest word.
- You re-open an old import link by mistake → the older scrape loses.
- A page with a fast clock → capture times are clamped to now, so it cannot
  lock out later scrapes.
- Anything you set by hand → recorded as yours at full weight, and no import
  will quietly undo it.

Anything a scrape does not mention keeps its current rating, always.

Canvas also carries a row per learning goal — "Learning Goal 0" through
"Learning Goal 8" — where instructors record the official rating. Those never
feed the arithmetic, but when one is filled in the app checks it against what it
worked out and says so if they disagree.

## Privacy

Your grades live in your own browser's `localStorage`. There is no account, no
cookie and no session. The server only ever holds a scrape in transit between
your bookmarklet and your tab:

```
sha256(token) -> { source, capturedAt, items[] }, with an expiry
```

The token is hashed, so the store never holds a value that could be replayed.
An entry is deleted the moment your tab collects it and expires after fifteen
minutes regardless. Nothing is written to disk and payloads are never logged.
`SIGTERM` clears the store, so a redeploy drops anything in flight.

A whole course's scrape is about 10 KB, and it is held only while it is in
transit. The relay is bounded by a byte budget as well as an entry count, so
the memory it can occupy is fixed no matter how large or how numerous the
payloads are — past the budget it answers 503 and waits. `GET /api/health`
reports `pending` and `pendingBytes` if you want to watch it.

## Deploying

The Dockerfile is a Node runtime plus this repo — no build stage.

```sh
docker compose up --build      # http://localhost:8080
```

On Coolify: new application, Docker (Dockerfile), build context `/`, port
`8080`, health check `GET /api/health`.

### Serving it under a sub-path

To host it at `example.com/CSE2407` rather than on its own domain, either
arrangement works:

- **The proxy strips the prefix** (Coolify and Traefik do this for a
  path-based domain). Leave `BASE_PATH` unset. The proxy reports the prefix in
  `X-Forwarded-Prefix`, and the server puts a matching `<base>` into the page.
- **Nothing strips it.** Set `BASE_PATH=CSE2407`. The server removes the prefix
  itself and redirects the bare `/CSE2407` to `/CSE2407/`.

Setting `BASE_PATH` when the proxy also strips is harmless — the prefix is only
removed when it is actually present.

The `<base>` matters: without it, visiting `/CSE2407` with no trailing slash
makes the browser resolve `js/app.js` against the domain root and every asset
404s. `X-Forwarded-Prefix` is sanitised before it reaches the page, so a
crafted header cannot inject markup.

The page needs no configuration of its own: it works out where it is served
from by looking at its own script URL, which is also what gets baked into each
user's bookmarklet.

**Serve it over HTTPS.** Canvas and Gradescope are HTTPS, and a browser blocks a
`fetch` from those pages to an `http://` origin as mixed content — without TLS
every import silently falls back to the URL-fragment path.

**Run a single replica.** Payloads live in process memory, so with two
containers a bookmarklet could drop a scrape on one while your browser polls the
other. Moving the store to Redis is about twenty lines in `server/server.js` if
you ever need more; the interface is already just get/set/delete.

| Variable | Default | |
|---|---|---|
| `PORT` | `8080` | listen port |
| `HOST` | `0.0.0.0` | listen address |
| `SYNC_TTL_MS` | `900000` | how long a scrape waits to be collected |
| `SYNC_MAX_BODY` | `131072` | largest accepted payload |
| `SYNC_MAX_ENTRIES` | `5000` | cap on payloads held at once |
| `SYNC_MAX_BYTES` | `67108864` | total bytes the relay may hold |
| `BASE_PATH` | *(unset)* | sub-path it is served under, e.g. `CSE2407` |
| `SYNC_RATE_LIMIT` | `60` | requests per minute per IP |

The static handler serves from a fixed allow-list rather than the filesystem, so
path traversal has nothing to reach. `POST /api/sync/:token` allows any origin,
because a bookmarklet legitimately runs on whatever host a school's Canvas lives
on; that is safe because the route reads no cookies, sends no credentials, and
the token is the only authority. `GET` sends no CORS headers at all, so only the
app's own origin can collect a payload.

## Layout

```
index.html              markup
favicon.svg             three bars in the P / D / S colours
css/styles.css          one stylesheet, theming via custom properties
js/data.js              assessment structure and Canvas assignment ids
js/syllabus.js          completes LG 0's subgoals per the syllabus
js/engine.js            the grading rules, no DOM
js/leverage.js          cross-references and what can still change the grade
js/ingest.js            turns scraped rows into ratings, and merges sources
js/scrape.js            the bookmarklet body (source)
js/bookmarklet.js       generated from scrape.js; do not edit
js/tooltip.js           the shared tooltip bubble
js/app.js               rendering and interaction
server/server.js        static host and import relay
tools/                  build script for the bookmarklet
tests/                  node test suites
Dockerfile              deployment image
```

`js/engine.js`, `js/ingest.js` and `js/leverage.js` have no DOM dependency and
run under node, so the rules are tested without a browser. After editing
`js/scrape.js`, run `npm run build:bookmarklet`.

## Adapting it to another course

Most of this is specific to CSE 2407's scheme, but the shape is reusable:

- `js/data.js` — the assessment list, subgoal membership and Canvas ids.
- `js/engine.js` — point values, the letter ladder, and the aggregation rules.
- `js/syllabus.js` — anything the published data leaves out.
- `js/ingest.js` — how a scraped grade becomes a rating. The tuning block at the
  top holds the vocabulary and thresholds.
- `js/scrape.js` — the page selectors, one independent block per site.

## Accessibility

Keyboard reachable throughout with visible focus; ratings are exposed as
`aria-pressed` buttons and the points bar carries a text description. Every
coloured mark also carries its letter, so colour is never the only signal, and
the P / D / S palette was checked for colour-vision separation against both
themes. Text contrast clears WCAG AA in light and dark. Reduced-motion and
print styles are respected.
