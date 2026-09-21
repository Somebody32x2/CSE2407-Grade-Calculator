/**
 * Turns scraped Canvas / Gradescope rows into ratings this app understands.
 *
 * The bookmarklet stays deliberately dumb: it reads the page and ships raw
 * rows. All the interpretation happens here, so the matching and grade rules
 * can be corrected without anyone reinstalling their bookmarklet.
 *
 * A scraped row looks like:
 *   { canvasId: '975118', name: 'Course Setup/Policies Quiz',
 *     grade: 'P', score: 2, outOf: 2 }
 * Every field is optional except that one of `canvasId` or `name` must be
 * present, and one of `grade` or `score` must be present.
 *
 * ---------------------------------------------------------------------------
 * TUNING: everything a real page might disagree with is in this block.
 * ---------------------------------------------------------------------------
 */

/** Words a page might use in place of a bare P / D / S. */
const RATING_WORDS = {
  p: 'P', proficient: 'P', complete: 'P', completed: 'P', pass: 'P', passed: 'P', full: 'P',
  d: 'D', developing: 'D', partial: 'D', 'partially complete': 'D',
  s: 'S', starting: 'S', incomplete: 'S', 'not started': 'S', missing: 'S', fail: 'S', failed: 'S',
  // Gradescope status text. "Submitted" and "Ungraded" mean the work is with a
  // grader and must not be scored at all; see AWAITING_GRADE.
  'no submission': 'S',
};

/**
 * How much authority a reading carries. Merging two sources is a question of
 * which evidence is better, not which arrived last.
 *
 *   MARKED (2)  an actual score or letter. Authoritative.
 *   ABSENT (1)  "No Submission" -- a page that tracks submissions saying it has
 *               none. True as far as that page knows, but Gradescope reports it
 *               for work Canvas has already graded, so it must never overwrite
 *               a real mark.
 *   NONE   (0)  nothing usable. Never written.
 */
const STRENGTH = { MARKED: 2, ABSENT: 1, NONE: 0 };

/** Words that mean "this page has no submission", not "this scored zero". */
const ABSENT_WORDS = /^(no submission|missing|not started|incomplete)$/i;

/** Statuses that mean "not marked yet" rather than a grade of any kind. */
const AWAITING_GRADE = /^(submitted|ungraded|pending|in progress|late)$/i;

/** Words a page might use in place of a bare A / B / T on an exam. */
const EXAM_WORDS = {
  a: 'A', application: 'A', advanced: 'A',
  b: 'B', baseline: 'B',
  t: 'T', attempted: 'T',
};

/**
 * Fraction of the maximum needed for each rating when a row only gives a
 * number. Mirrors the published zyBooks thresholds (9/10 and 7/10) so one
 * rule covers both cases.
 */
const PROPORTION_THRESHOLDS = [
  { min: 0.9, rating: 'P' },
  { min: 0.7, rating: 'D' },
];

/**
 * Rows that are not assessments at all.
 *
 * Canvas shows the course's own roll-up rows in the same table -- "Points:
 * LGs", "Points: Total (LGs and Exams)", "LG Developing Count" and so on.
 * They would otherwise be reported as unmatched and clutter the result.
 */
const IGNORE_NAME = /^(total|imputed total|assignments|extra credit)$/i;
const IGNORE_ROLLUP = /^(points:|lg\s+(proficient|developing|starting)\s+count)/i;

/**
 * Canvas also carries one row per learning goal -- "Learning Goal 0" through
 * "Learning Goal 8", each out of 2 -- which is where the instructors record
 * the official rating for the goal. Those are not assessments and must not be
 * fed into the subgoal arithmetic, but they are worth keeping: when one is
 * filled in it can be checked against what this calculator derived.
 */
const OFFICIAL_GOAL_RE = /^learning\s+goal\s+([0-8])\s*$/i;

/* -------------------------------------------------------------------------- */

/**
 * Exact-ish name key: case and punctuation are ignored, nothing else.
 *
 * The "(LG 3.1)" tags must survive: "Sorting Program Writeup (LG 3.1)
 * Typesetting" and its 3.2 twin are different assessments and differ only
 * there. Dropping the tag silently merged them.
 */
function stripPrefixes(value) {
  return String(value == null ? '' : value)
    // Gradescope lists retakes as "(Resubmission) Knowledge Check (LG 2.2)".
    .replace(/^\s*\((?:re)?submission\)\s*/i, '')
    // Belt and braces: the scraper strips Canvas's screen-reader text, but an
    // older bookmarklet still in someone's bookmarks bar will not have.
    .replace(/links to an external site\.?/ig, '')
    .trim();
}

function normaliseName(value) {
  return stripPrefixes(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Pull the learning-goal tags out of a name: "(LG 4.1, 4.2)" -> ['4.1','4.2'].
 * Canvas sometimes splits an assessment our data keeps together, so a row
 * tagged only 4.2 still has to find the assessment tagged 4.1 and 4.2.
 */
function parseLgTags(value) {
  const m = String(value == null ? '' : value).match(/\(\s*lg\s*([\d.,\s]+)\)/i);
  if (!m) return [];
  return m[1].split(',').map((t) => t.trim()).filter((t) => /^\d+(\.\d+)?$/.test(t));
}

/** Looser key, LG tag removed, for pages that render the name without it. */
function looseName(value) {
  return stripPrefixes(value)
    .toLowerCase()
    .replace(/\(\s*lg\s*[\d.,\s]+\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const m = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Pull a score out of free text such as "8.5/10", "17 / 20" or "85%".
 * Returns { score, outOf } with outOf null when the text only gave a percent.
 */
function parseScoreText(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return null;

  const frac = s.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (frac) return { score: Number(frac[1]), outOf: Number(frac[2]) };

  const pct = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pct) return { score: Number(pct[1]), outOf: 100 };

  return null;
}

/**
 * Decide the rating a single scraped row implies.
 *
 * @param {object} row       the scraped row
 * @param {object} context   { isExam, isZyBooks }
 * @returns {{rating: string|null, basis: string}}
 */
function interpretGrade(row, context = {}) {
  const words = context.isExam ? EXAM_WORDS : RATING_WORDS;

  // 0. Work that is in with a grader has no grade yet, whatever else the cell says.
  const rawText = String(row.grade == null ? '' : row.grade).trim();
  if (AWAITING_GRADE.test(rawText)) {
    return { rating: null, basis: 'awaiting grading', strength: STRENGTH.NONE };
  }

  // 1. An explicit letter or word wins.
  const raw = rawText.toLowerCase();
  if (raw && Object.prototype.hasOwnProperty.call(words, raw)) {
    return {
      rating: words[raw],
      basis: ABSENT_WORDS.test(rawText) ? 'no submission' : 'letter',
      strength: ABSENT_WORDS.test(rawText) ? STRENGTH.ABSENT : STRENGTH.MARKED,
    };
  }

  // 2. Otherwise fall back to a number.
  let score = toNumber(row.score);
  let outOf = toNumber(row.outOf);
  if (score === null) {
    const parsed = parseScoreText(row.grade);
    if (parsed) { score = parsed.score; outOf = parsed.outOf; }
  }
  if (score === null) return { rating: null, basis: 'no grade', strength: STRENGTH.NONE };

  // zyBooks is marked out of 10 when the page gives no denominator of its own.
  // On Canvas it is actually out of 100, and that denominator is used as-is.
  if (outOf === null && context.isZyBooks) outOf = 10;

  /**
   * Out of 2 means the rating points themselves: P=2, D=1, S=0. This is the
   * common case on Canvas, and it must not go through the proportion rule --
   * 1 out of 2 is a Developing, not the 50% that would round down to S.
   */
  if (outOf === 2 || (outOf === null && Number.isInteger(score) && score >= 0 && score <= 2)) {
    const points = Math.max(0, Math.min(2, Math.round(score)));
    return { rating: ['S', 'D', 'P'][points], basis: 'points', strength: STRENGTH.MARKED };
  }

  if (outOf === null || outOf <= 0) {
    return { rating: null, basis: 'no denominator', strength: STRENGTH.NONE };
  }

  const proportion = score / outOf;
  for (const t of PROPORTION_THRESHOLDS) {
    if (proportion >= t.min) {
      return { rating: t.rating, basis: 'proportion', strength: STRENGTH.MARKED };
    }
  }
  return { rating: 'S', basis: 'proportion', strength: STRENGTH.MARKED };
}

/** True when a row is a resubmission slot rather than the original work. */
function isResubmission(name) {
  return /^\s*\(re-?submission\)/i.test(String(name == null ? '' : name));
}

/**
 * When the payload was taken, as a number, never in the future.
 *
 * A host page with a skewed clock must not be able to stamp a scrape so far
 * ahead that every later one loses to it.
 */
function capturedAtOf(payload) {
  const now = Date.now();
  const parsed = Date.parse((payload && payload.capturedAt) || '');
  return Number.isFinite(parsed) ? Math.min(parsed, now) : now;
}

/**
 * Should this reading replace what is already recorded?
 *
 * Better evidence always wins. Equal evidence is settled by which scrape is
 * more recent, so a regrade lands but a replayed old payload does not.
 */
function shouldReplace(existing, incoming) {
  if (incoming.strength <= STRENGTH.NONE) return false;
  if (!existing) return true;
  if (incoming.strength !== existing.strength) return incoming.strength > existing.strength;
  return incoming.at >= existing.at;
}

/**
 * Match scraped rows against the course assessments.
 *
 * canvasId is authoritative: every assessment has one and they are unique.
 * Names are the fallback, also unique, and are normalised first so that
 * "MCQs: Java fundamentals (LG 0.1)" still matches.
 */
function buildIndex(data) {
  const byCanvasId = new Map();
  const byName = new Map();
  const looseCounts = new Map();
  const tagCounts = new Map();

  const tagKey = (a, tag) => looseName(a.name) + '|' + tag;

  data.assessments.forEach((a) => {
    if (a.canvasId) byCanvasId.set(String(a.canvasId).trim(), a);
    byName.set(normaliseName(a.name), a);

    const loose = looseName(a.name);
    looseCounts.set(loose, (looseCounts.get(loose) || 0) + 1);

    parseLgTags(a.name).forEach((tag) => {
      const k = tagKey(a, tag);
      tagCounts.set(k, (tagCounts.get(k) || 0) + 1);
    });
  });

  // Keep only the keys that stay unambiguous, so a near-miss is reported
  // rather than resolved by whichever assessment happened to be indexed last.
  const byLooseName = new Map();
  const byNameAndTag = new Map();
  data.assessments.forEach((a) => {
    const loose = looseName(a.name);
    if (looseCounts.get(loose) === 1) byLooseName.set(loose, a);
    parseLgTags(a.name).forEach((tag) => {
      const k = tagKey(a, tag);
      if (tagCounts.get(k) === 1) byNameAndTag.set(k, a);
    });
  });

  return { byCanvasId, byName, byLooseName, byNameAndTag };
}

function matchRow(row, index) {
  if (row.canvasId) {
    const hit = index.byCanvasId.get(String(row.canvasId).trim());
    if (hit) return { assessment: hit, by: 'canvasId' };
  }
  if (row.name) {
    const exact = index.byName.get(normaliseName(row.name));
    if (exact) return { assessment: exact, by: 'name' };

    const loose = index.byLooseName.get(looseName(row.name));
    if (loose) return { assessment: loose, by: 'loose name' };

    // "Knowledge Check (LG 4.2)" finding "Knowledge Check (LG 4.1, 4.2)".
    const base = looseName(row.name);
    for (const tag of parseLgTags(row.name)) {
      const hit = index.byNameAndTag.get(base + '|' + tag);
      if (hit) return { assessment: hit, by: 'name and LG tag' };
    }
  }
  return null;
}

/** Exams are not assessments; they are matched separately by name. */
const EXAM_PATTERNS = [
  { key: 'exam1', re: /\bexam\s*(1|one)\b|\bmidterm\s*1\b/i },
  { key: 'exam2', re: /\bexam\s*(2|two)\b|\bmidterm\s*2\b/i },
  { key: 'exam3', re: /\bexam\s*(3|three)\b|\bfinal\b/i },
];

function matchExam(row) {
  const name = String(row.name || '');
  for (const p of EXAM_PATTERNS) if (p.re.test(name)) return p.key;
  return null;
}

const SPECIAL_TOPICS_RE = /special\s*topics/i;

/**
 * Fold a scraped payload into the ratings already held.
 *
 * Canvas and Gradescope do not cover the same ground and do not agree on
 * timing: Gradescope often has a mark days before Canvas does, and Canvas
 * carries plenty that Gradescope never sees. So this merges rather than
 * replaces, and keeps a note of where each rating came from so the next scrape
 * from either source can be judged against it.
 *
 * `current.provenance` maps a target -- an assessment id, `exam1`..`exam3`, or
 * `specialTopics` -- to `{ source, at, strength }`. Pass the one this function
 * returned last time.
 *
 * Nothing the payload does not mention is touched.
 *
 * @returns {{ratings, zyScores, exams, specialTopics, provenance, officialGoals,
 *           matched, skipped, unmatched, overruled}}
 */
function ingest(data, payload, current = {}) {
  const index = buildIndex(data);
  const ratings = Object.assign({}, current.ratings);
  const zyScores = Object.assign({}, current.zyScores);
  const exams = Object.assign({ exam1: null, exam2: null, exam3: null }, current.exams);
  const provenance = Object.assign({}, current.provenance);
  const officialGoals = Object.assign({}, current.officialGoals);
  let specialTopics = current.specialTopics || null;

  const source = (payload && payload.source) || 'unknown';
  const at = capturedAtOf(payload);

  const matched = [];
  const unmatched = [];
  const skipped = [];
  const overruled = [];
  const rows = Array.isArray(payload && payload.items) ? payload.items : [];

  /**
   * Apply one reading, or record why it was declined.
   * @returns {boolean} whether it was written
   */
  function offer(target, label, verdict, by, onWrite) {
    const incoming = { source, at, strength: verdict.strength };
    const existing = provenance[target];

    if (!shouldReplace(existing, incoming)) {
      overruled.push({
        name: label,
        rating: verdict.rating,
        reason: existing && existing.strength > verdict.strength
          ? 'already marked by ' + existing.source
          : 'a newer reading from ' + (existing ? existing.source : source) + ' is held',
      });
      return false;
    }

    onWrite();
    provenance[target] = incoming;
    matched.push({
      target,
      name: label,
      rating: verdict.rating,
      by,
      basis: verdict.basis,
      source,
    });
    return true;
  }

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const name = String(row.name || '').trim();
    if (IGNORE_NAME.test(name) || IGNORE_ROLLUP.test(name)) return;

    // The instructors' own rating for a whole goal. Recorded, never applied.
    const official = name.match(OFFICIAL_GOAL_RE);
    if (official) {
      const verdict = interpretGrade(row, {});
      if (verdict.rating) officialGoals[official[1]] = verdict.rating;
      return;
    }

    const examKey = matchExam(row);
    if (examKey) {
      const verdict = interpretGrade(row, { isExam: true });
      if (!verdict.rating) return skipped.push({ name, reason: verdict.basis });
      offer(examKey, name, verdict, 'exam name', () => { exams[examKey] = verdict.rating; });
      return;
    }

    if (SPECIAL_TOPICS_RE.test(name)) {
      const verdict = interpretGrade(row, {});
      if (!verdict.rating) return skipped.push({ name, reason: verdict.basis });
      offer('specialTopics', name, verdict, 'name', () => { specialTopics = verdict.rating; });
      return;
    }

    const hit = matchRow(row, index);
    if (!hit) {
      unmatched.push({ name, canvasId: row.canvasId || null });
      return;
    }

    const isZyBooks = /zybooks/i.test(hit.assessment.name);
    const verdict = interpretGrade(row, { isZyBooks });
    if (!verdict.rating) {
      skipped.push({ name: hit.assessment.name, reason: verdict.basis });
      return;
    }

    /**
     * An empty resubmission slot says nothing about the original mark. Only a
     * resubmission that has actually been graded carries weight -- and then it
     * is the latest word on that assessment, so it keeps full strength.
     */
    if (isResubmission(row.name) && verdict.strength < STRENGTH.MARKED) {
      skipped.push({ name: hit.assessment.name, reason: 'resubmission not yet submitted' });
      return;
    }

    offer(hit.assessment.id, hit.assessment.name, verdict, hit.by, () => {
      ratings[hit.assessment.id] = verdict.rating;
      if (isZyBooks) {
        const score = toNumber(row.score);
        const parsed = score === null ? parseScoreText(row.grade) : { score };
        if (parsed && parsed.score !== null && parsed.score !== undefined) {
          zyScores[hit.assessment.id] = String(parsed.score);
        }
      }
    });
  });

  return {
    ratings,
    zyScores,
    exams,
    specialTopics,
    provenance,
    officialGoals,
    matched,
    skipped,
    unmatched,
    overruled,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ingest,
    interpretGrade,
    normaliseName,
    looseName,
    stripPrefixes,
    parseLgTags,
    isResubmission,
    shouldReplace,
    capturedAtOf,
    STRENGTH,
    parseScoreText,
    buildIndex,
    matchRow,
    matchExam,
    RATING_WORDS,
    EXAM_WORDS,
    PROPORTION_THRESHOLDS,
  };
}
