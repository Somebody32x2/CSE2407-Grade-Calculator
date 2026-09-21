/**
 * Tests for the grade-import path: interpreting scraped rows, matching them to
 * course assessments, and the relay that carries them.
 *
 * Run: node tests/sync.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

const root = path.join(__dirname, '..');
const I = require(path.join(root, 'js/ingest.js'));
const S = require(path.join(root, 'js/syllabus.js'));
const B = require(path.join(root, 'js/bookmarklet.js'));
const RAW = (0, eval)(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + '; ASSESSMENT_DATA');
const DATA = S.applySyllabus(RAW);

let passed = 0;
const failures = [];
const tests = [];

function test(name, fn) { tests.push({ name, fn }); }

function byName(name) {
  const hit = DATA.assessments.find((a) => a.name === name);
  if (!hit) throw new Error('no such assessment: ' + name);
  return hit;
}

// --- Grade interpretation ---------------------------------------------------

test('a bare letter is taken at face value', () => {
  assert.strictEqual(I.interpretGrade({ grade: 'P' }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ grade: 'd' }).rating, 'D');
  assert.strictEqual(I.interpretGrade({ grade: ' S ' }).rating, 'S');
});

test('spelled-out ratings are understood', () => {
  assert.strictEqual(I.interpretGrade({ grade: 'Proficient' }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ grade: 'Developing' }).rating, 'D');
  assert.strictEqual(I.interpretGrade({ grade: 'Starting' }).rating, 'S');
  assert.strictEqual(I.interpretGrade({ grade: 'Complete' }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ grade: 'Missing' }).rating, 'S');
});

test('exam rows use the exam vocabulary', () => {
  assert.strictEqual(I.interpretGrade({ grade: 'A' }, { isExam: true }).rating, 'A');
  assert.strictEqual(I.interpretGrade({ grade: 'Application' }, { isExam: true }).rating, 'A');
  assert.strictEqual(I.interpretGrade({ grade: 'Baseline' }, { isExam: true }).rating, 'B');
  assert.strictEqual(I.interpretGrade({ grade: 'Attempted' }, { isExam: true }).rating, 'T');
});

test('"A" means Application on an exam and nothing on an assessment', () => {
  assert.strictEqual(I.interpretGrade({ grade: 'A' }, { isExam: true }).rating, 'A');
  assert.strictEqual(I.interpretGrade({ grade: 'A' }, {}).rating, null);
});

test('a fraction is read as a proportion', () => {
  assert.strictEqual(I.interpretGrade({ grade: '10/10' }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ grade: '9 / 10' }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ grade: '8/10' }).rating, 'D');
  assert.strictEqual(I.interpretGrade({ grade: '6.9/10' }).rating, 'S');
  assert.strictEqual(I.interpretGrade({ grade: '17/20' }).rating, 'D');
});

test('a percentage is read the same way', () => {
  assert.strictEqual(I.interpretGrade({ grade: '95%' }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ grade: '70%' }).rating, 'D');
  assert.strictEqual(I.interpretGrade({ grade: '12%' }).rating, 'S');
});

test('zyBooks rows are assumed out of ten', () => {
  assert.strictEqual(I.interpretGrade({ score: 9.4 }, { isZyBooks: true }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ score: 7 }, { isZyBooks: true }).rating, 'D');
  assert.strictEqual(I.interpretGrade({ score: 3 }, { isZyBooks: true }).rating, 'S');
});

test('a bare 0, 1 or 2 is read as the points themselves', () => {
  assert.strictEqual(I.interpretGrade({ score: 2 }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ score: 1 }).rating, 'D');
  assert.strictEqual(I.interpretGrade({ score: 0 }).rating, 'S');
});

test('a number with no denominator and no context is refused, not guessed', () => {
  const v = I.interpretGrade({ score: 17 });
  assert.strictEqual(v.rating, null);
  assert.strictEqual(v.basis, 'no denominator');
});

test('an empty or dashed cell yields no rating', () => {
  assert.strictEqual(I.interpretGrade({ grade: '' }).rating, null);
  assert.strictEqual(I.interpretGrade({ grade: '-' }).rating, null);
  assert.strictEqual(I.interpretGrade({}).rating, null);
});

// --- Rules taken from the real Canvas and Gradescope pages -----------------

test('out of 2 means the rating points, not a percentage', () => {
  // The common Canvas case. 1/2 is a Developing; the proportion rule would
  // have called 50% a Starting.
  assert.strictEqual(I.interpretGrade({ score: '2.0', outOf: '2' }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ score: '1.0', outOf: '2' }).rating, 'D');
  assert.strictEqual(I.interpretGrade({ score: '0.0', outOf: '2' }).rating, 'S');
});

test('zyBooks on Canvas is out of 100 and read as a proportion', () => {
  assert.strictEqual(I.interpretGrade({ score: '100.0', outOf: '100' }, { isZyBooks: true }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ score: '90.9090909090909', outOf: '100' }, { isZyBooks: true }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ score: '25.0', outOf: '100' }, { isZyBooks: true }).rating, 'S');
  assert.strictEqual(I.interpretGrade({ score: '75', outOf: '100' }, { isZyBooks: true }).rating, 'D');
});

test('a Gradescope score cell is read as a fraction', () => {
  assert.strictEqual(I.interpretGrade({ grade: '12.0 / 12.0' }).rating, 'P');
  assert.strictEqual(I.interpretGrade({ grade: '6.0 / 12.0' }).rating, 'S');
});

test('work sitting with a grader produces no rating', () => {
  for (const status of ['Submitted', 'Ungraded', 'Pending', 'In Progress']) {
    const v = I.interpretGrade({ grade: status });
    assert.strictEqual(v.rating, null, status);
    assert.strictEqual(v.basis, 'awaiting grading');
  }
});

test('"No Submission" is a real zero', () => {
  assert.strictEqual(I.interpretGrade({ grade: 'No Submission' }).rating, 'S');
});

test('a Resubmission prefix is stripped before matching', () => {
  assert.strictEqual(I.stripPrefixes('(Resubmission) Knowledge Check (LG 2.2)'),
    'Knowledge Check (LG 2.2)');
  const index = I.buildIndex(DATA);
  const hit = I.matchRow({ name: '(Resubmission) Knowledge Check (LG 2.2)' }, index);
  assert.ok(hit, 'should match');
  assert.strictEqual(hit.assessment.name, 'Knowledge Check (LG 2.2)');
});

test("Canvas's own roll-up rows are ignored, not reported as unmatched", () => {
  const r = I.ingest(DATA, {
    items: [
      { name: 'Points: LGs', grade: '', outOf: '18' },
      { name: 'Points: Exams', grade: '', outOf: '12' },
      { name: 'Points: Total (LGs and Exams)', grade: '', outOf: '30' },
      { name: 'LG Developing Count', grade: '', outOf: '9' },
    ],
  }, EMPTY);
  assert.strictEqual(r.matched.length, 0);
  assert.strictEqual(r.unmatched.length, 0, 'ignored outright');
  assert.strictEqual(r.skipped.length, 0);
});

test('a Gradescope name with a shorter LG tag still matches', () => {
  const index = I.buildIndex(DATA);
  const hit = I.matchRow({ name: 'Program Set-up Check (LG 0)' }, index);
  assert.strictEqual(hit.assessment.name, 'Program Set-up Check (LG 0.1)');
});

test('a whole Canvas-shaped scrape maps end to end', () => {
  const zy = byName('zyBooks LG 0');
  const studio = byName('Week 1 Studio (LG 0.1)');
  const r = I.ingest(DATA, {
    source: 'Canvas',
    items: [
      { canvasId: String(studio.canvasId), name: studio.name, score: '2.0', outOf: '2' },
      { canvasId: String(zy.canvasId), name: zy.name, score: '90.9090909090909', outOf: '100' },
      { canvasId: String(byName('Knowledge Check (LG 1.1)').canvasId),
        name: 'Knowledge Check (LG 1.1)', score: '', outOf: '2' },
      { name: 'Points: Total (LGs and Exams)', score: '', outOf: '30' },
    ],
  }, EMPTY);

  assert.strictEqual(r.ratings[studio.id], 'P');
  assert.strictEqual(r.ratings[zy.id], 'P');
  assert.strictEqual(r.zyScores[zy.id], '90.9090909090909');
  assert.strictEqual(r.ratings[byName('Knowledge Check (LG 1.1)').id], undefined,
    'an ungraded row leaves the rating alone');
  assert.strictEqual(r.unmatched.length, 0);
});

// --- Name normalisation and matching ---------------------------------------

test('names normalise past punctuation and case, keeping the LG tag', () => {
  assert.strictEqual(I.normaliseName('MCQs: Java fundamentals (LG 0.1)'), 'mcqs java fundamentals lg 0 1');
  assert.strictEqual(I.normaliseName('  Course Setup/Policies Quiz '), 'course setup policies quiz');
});

test('the loose key drops the LG tag for pages that omit it', () => {
  assert.strictEqual(I.looseName('MCQs: Java fundamentals (LG 0.1)'), 'mcqs java fundamentals');
});

test('a page that omits the tag still matches when that is unambiguous', () => {
  const index = I.buildIndex(DATA);
  const hit = I.matchRow({ name: 'MCQs: Java fundamentals' }, index);
  assert.strictEqual(hit.by, 'loose name');
  assert.strictEqual(hit.assessment.name, 'MCQs: Java fundamentals (LG 0.1)');
});

test('an ambiguous tag-less name is refused rather than matched to a coin flip', () => {
  const index = I.buildIndex(DATA);
  // "Sorting Program Writeup (LG 3.1)" and "(LG 3.2)" collapse to the same key.
  assert.strictEqual(I.matchRow({ name: 'Sorting Program Writeup Typesetting' }, index), null);
  assert.ok(I.matchRow({ name: 'Sorting Program Writeup (LG 3.2) Typesetting' }, index),
    'the full name still matches exactly');
});

test('every course assessment still has a unique normalised name', () => {
  const seen = new Map();
  DATA.assessments.forEach((a) => {
    const key = I.normaliseName(a.name);
    assert.ok(!seen.has(key), `"${a.name}" collides with "${seen.get(key)}"`);
    seen.set(key, a.name);
  });
});

test('canvasId matches even when the name has drifted', () => {
  const index = I.buildIndex(DATA);
  const hit = I.matchRow({ canvasId: '975118', name: 'Totally renamed quiz' }, index);
  assert.strictEqual(hit.by, 'canvasId');
  assert.strictEqual(hit.assessment.name, 'Course Setup/Policies Quiz');
});

test('name matches when there is no canvasId', () => {
  const index = I.buildIndex(DATA);
  const hit = I.matchRow({ name: 'zyBooks LG 4' }, index);
  assert.strictEqual(hit.by, 'name');
  assert.strictEqual(hit.assessment.name, 'zyBooks LG 4');
});

test('an unknown row matches nothing rather than the nearest thing', () => {
  const index = I.buildIndex(DATA);
  assert.strictEqual(I.matchRow({ name: 'Course evaluation bonus' }, index), null);
  assert.strictEqual(I.matchRow({ canvasId: '999999' }, index), null);
});

test('exams are recognised by name, including the final', () => {
  assert.strictEqual(I.matchExam({ name: 'Exam 1' }), 'exam1');
  assert.strictEqual(I.matchExam({ name: 'Midterm 2' }), 'exam2');
  assert.strictEqual(I.matchExam({ name: 'Final Exam' }), 'exam3');
  assert.strictEqual(I.matchExam({ name: 'Exam Review Session' }), null);
});

test('an LG tag finds an assessment that bundles several tags', () => {
  const index = I.buildIndex(DATA);
  // Canvas splits what the course data keeps together as "(LG 4.1, 4.2)".
  const hit = I.matchRow({ name: 'Knowledge Check (LG 4.2)' }, index);
  assert.ok(hit, 'should match');
  assert.strictEqual(hit.by, 'name and LG tag');
  assert.strictEqual(hit.assessment.name, 'Knowledge Check (LG 4.1, 4.2)');
  assert.strictEqual(I.matchRow({ name: 'Knowledge Check (LG 4.1)' }, index).assessment.name,
    'Knowledge Check (LG 4.1, 4.2)');
});

test('LG tags parse out of a name', () => {
  assert.deepStrictEqual(I.parseLgTags('Knowledge Check (LG 4.1, 4.2)'), ['4.1', '4.2']);
  assert.deepStrictEqual(I.parseLgTags('Program Set-up Check (LG 0)'), ['0']);
  assert.deepStrictEqual(I.parseLgTags('Course Evaluation'), []);
});

test('a tag that matches two assessments is refused, not guessed', () => {
  const index = I.buildIndex(DATA);
  // "Sorting Program Writeup (LG 3.1)" exists twice once Typesetting is
  // stripped, so the tag route must not pick one arbitrarily.
  const hit = I.matchRow({ name: 'Sorting Program Writeup (LG 3.1) Something Else' }, index);
  assert.strictEqual(hit, null);
});

// --- Whole-payload ingest ---------------------------------------------------

const EMPTY = { ratings: {}, zyScores: {}, exams: { exam1: null, exam2: null, exam3: null } };

test('a Canvas-shaped payload lands on the right assessments', () => {
  const r = I.ingest(DATA, {
    source: 'Canvas',
    items: [
      { canvasId: '975118', name: 'Course Setup/Policies Quiz', grade: 'P' },
      { canvasId: String(byName('zyBooks LG 1').canvasId), name: 'zyBooks LG 1', grade: '8.4/10' },
      { name: 'Exam 1', grade: 'Application' },
      { name: 'Total', grade: '87%' },
    ],
  }, EMPTY);

  assert.strictEqual(r.ratings[byName('Course Setup/Policies Quiz').id], 'P');
  assert.strictEqual(r.ratings[byName('zyBooks LG 1').id], 'D');
  assert.strictEqual(r.zyScores[byName('zyBooks LG 1').id], '8.4');
  assert.strictEqual(r.exams.exam1, 'A');
  assert.strictEqual(r.matched.length, 3, '"Total" is ignored, not matched');
  assert.strictEqual(r.unmatched.length, 0);
});

test('unmatched rows are reported rather than guessed at', () => {
  const r = I.ingest(DATA, {
    items: [
      { name: 'Some Other Course Thing', grade: 'P' },
      { name: 'Attendance Bonus', grade: '1/1' },
    ],
  }, EMPTY);
  assert.strictEqual(r.matched.length, 0);
  assert.deepStrictEqual(r.unmatched.map((u) => u.name),
    ['Some Other Course Thing', 'Attendance Bonus']);
});

test('rows with no usable grade are skipped, not zeroed', () => {
  const r = I.ingest(DATA, {
    items: [{ canvasId: '975118', name: 'Course Setup/Policies Quiz', grade: '-' }],
  }, { ratings: { [byName('Course Setup/Policies Quiz').id]: 'P' }, zyScores: {}, exams: {} });
  assert.strictEqual(r.ratings[byName('Course Setup/Policies Quiz').id], 'P', 'left alone');
  assert.strictEqual(r.skipped.length, 1);
});

test('assessments the payload never mentions keep their current rating', () => {
  const current = { ratings: {}, zyScores: {}, exams: { exam1: 'B', exam2: null, exam3: null } };
  DATA.assessments.forEach((a) => { current.ratings[a.id] = 'S'; });
  current.ratings[byName('zyBooks LG 5').id] = 'P';

  const r = I.ingest(DATA, { items: [{ name: 'zyBooks LG 1', grade: '10/10' }] }, current);
  assert.strictEqual(r.ratings[byName('zyBooks LG 1').id], 'P', 'updated');
  assert.strictEqual(r.ratings[byName('zyBooks LG 5').id], 'P', 'untouched');
  assert.strictEqual(r.ratings[byName('zyBooks LG 2').id], 'S', 'untouched');
  assert.strictEqual(r.exams.exam1, 'B', 'untouched');
});

test('Special Topics is routed to its own component', () => {
  const r = I.ingest(DATA, { items: [{ name: 'Special Topics Credit', grade: 'P' }] }, EMPTY);
  assert.strictEqual(r.specialTopics, 'P');
  assert.strictEqual(r.matched[0].target, 'specialTopics');
});

test('Canvas rows for whole learning goals are recorded, never applied', () => {
  const r = I.ingest(DATA, {
    items: [
      { name: 'Learning Goal 3', score: '1.0', outOf: '2' },
      { name: 'Learning Goal 5', score: '2.0', outOf: '2' },
      { name: 'Learning Goal 7', score: '', outOf: '2' },
    ],
  }, EMPTY);
  assert.deepStrictEqual(r.officialGoals, { 3: 'D', 5: 'P' },
    'ungraded goal rows are left out');
  assert.strictEqual(r.matched.length, 0, 'they are not assessments');
  assert.strictEqual(r.unmatched.length, 0, 'and not reported as misses');
  assert.deepStrictEqual(r.ratings, {}, 'and cannot touch the arithmetic');
});

test('a malformed payload is survivable', () => {
  for (const bad of [null, {}, { items: null }, { items: [null, 3, 'x', {}] }]) {
    const r = I.ingest(DATA, bad, EMPTY);
    assert.ok(r && typeof r === 'object');
    assert.strictEqual(r.matched.length, 0);
  }
});

// --- Merging Canvas and Gradescope -----------------------------------------
//
// The two sources cover different ground and mark at different times:
// Gradescope often has a result days before Canvas, and Canvas carries plenty
// Gradescope never sees. So an import has to merge, and has to decide which
// reading wins rather than simply taking the latest.

function seeded() {
  const ratings = {};
  DATA.assessments.forEach((a) => { ratings[a.id] = 'S'; });
  return { ratings, zyScores: {}, exams: { exam1: null, exam2: null, exam3: null }, provenance: {} };
}

/** Build a payload with an explicit capture time. */
function scrape(source, items, minutesAgo = 0) {
  return {
    source,
    capturedAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    items,
  };
}

test('evidence ranks above recency', () => {
  const MARKED = { strength: 2, at: 100 };
  const ABSENT = { strength: 1, at: 900 };
  assert.strictEqual(I.shouldReplace(MARKED, ABSENT), false, 'weaker never wins, even if newer');
  assert.strictEqual(I.shouldReplace(ABSENT, MARKED), true, 'stronger wins, even if older');
  assert.strictEqual(I.shouldReplace(MARKED, { strength: 2, at: 200 }), true, 'newer of equals wins');
  assert.strictEqual(I.shouldReplace(MARKED, { strength: 2, at: 50 }), false, 'older of equals loses');
  assert.strictEqual(I.shouldReplace(null, { strength: 0, at: 1 }), false, 'nothing usable never writes');
});

test('Gradescope marks first, then Canvas adds what it has', () => {
  const kc = byName('Knowledge Check (LG 1.1)');
  const studio = byName('Week 1 Studio (LG 0.1)');

  // Day one: Gradescope has the knowledge check, Canvas has not caught up.
  const first = I.ingest(DATA, scrape('Gradescope', [
    { name: 'Knowledge Check (LG 1.1)', grade: '2.0 / 2.0' },
  ], 2880), seeded());
  assert.strictEqual(first.ratings[kc.id], 'P');
  assert.strictEqual(first.provenance[kc.id].source, 'Gradescope');

  // Day three: Canvas now shows the knowledge check as still ungraded, and
  // brings a studio mark of its own.
  const second = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '', outOf: '2' },
    { canvasId: String(studio.canvasId), name: studio.name, score: '2.0', outOf: '2' },
  ], 0), first);

  assert.strictEqual(second.ratings[kc.id], 'P', 'Gradescope mark survives');
  assert.strictEqual(second.provenance[kc.id].source, 'Gradescope');
  assert.strictEqual(second.ratings[studio.id], 'P', 'Canvas mark added');
  assert.strictEqual(second.provenance[studio.id].source, 'Canvas');
});

test('an unfilled resubmission slot never wipes the original mark', () => {
  const kc = byName('Knowledge Check (LG 2.2)');

  const graded = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '2.0', outOf: '2' },
  ], 10), seeded());
  assert.strictEqual(graded.ratings[kc.id], 'P');

  // This is the exact row the real Gradescope page shows.
  const after = I.ingest(DATA, scrape('Gradescope', [
    { name: '(Resubmission) Knowledge Check (LG 2.2)', grade: 'No Submission' },
  ], 0), graded);

  assert.strictEqual(after.ratings[kc.id], 'P', 'still Proficient');
  assert.strictEqual(after.matched.length, 0);
  assert.strictEqual(after.skipped.length, 1);
  assert.strictEqual(after.skipped[0].reason, 'resubmission not yet submitted');
});

test('a graded resubmission is the latest word and does replace', () => {
  const kc = byName('Knowledge Check (LG 2.2)');
  const before = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '1.0', outOf: '2' },
  ], 10), seeded());
  assert.strictEqual(before.ratings[kc.id], 'D');

  const after = I.ingest(DATA, scrape('Gradescope', [
    { name: '(Resubmission) Knowledge Check (LG 2.2)', grade: '2.0 / 2.0' },
  ], 0), before);
  assert.strictEqual(after.ratings[kc.id], 'P', 'the regrade lands');
});

test('"No Submission" cannot overwrite a real mark from the other source', () => {
  const sw = byName('Sorting Program Writeup (LG 3.1)');
  const graded = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(sw.canvasId), name: sw.name, score: '2.0', outOf: '2' },
  ], 10), seeded());

  const after = I.ingest(DATA, scrape('Gradescope', [
    { name: 'Sorting Program Writeup (LG 3.1)', grade: 'No Submission' },
  ], 0), graded);

  assert.strictEqual(after.ratings[sw.id], 'P');
  assert.strictEqual(after.overruled.length, 1);
  assert.ok(/already marked by Canvas/.test(after.overruled[0].reason), after.overruled[0].reason);
});

test('"No Submission" does apply when nothing better is known', () => {
  const sw = byName('Sorting Program Writeup (LG 3.2)');
  const r = I.ingest(DATA, scrape('Gradescope', [
    { name: 'Sorting Program Writeup (LG 3.2)', grade: 'No Submission' },
  ], 0), seeded());
  assert.strictEqual(r.ratings[sw.id], 'S');
  assert.strictEqual(r.provenance[sw.id].strength, I.STRENGTH.ABSENT);
});

test('a later mark replaces an earlier one from the same source', () => {
  const kc = byName('Knowledge Check (LG 3.1)');
  const first = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '1.0', outOf: '2' },
  ], 60), seeded());
  assert.strictEqual(first.ratings[kc.id], 'D');

  const second = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '2.0', outOf: '2' },
  ], 0), first);
  assert.strictEqual(second.ratings[kc.id], 'P');
});

test('replaying an older payload does not undo a newer one', () => {
  const kc = byName('Knowledge Check (LG 3.2)');
  const newer = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '2.0', outOf: '2' },
  ], 0), seeded());
  assert.strictEqual(newer.ratings[kc.id], 'P');

  // An old hash-handoff link, opened again by mistake.
  const stale = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '0.0', outOf: '2' },
  ], 240), newer);
  assert.strictEqual(stale.ratings[kc.id], 'P', 'the newer reading stands');
  assert.strictEqual(stale.overruled.length, 1);
});

test('a page with a clock running fast cannot lock out later scrapes', () => {
  const kc = byName('Knowledge Check (LG 7.2)');
  const future = {
    source: 'Gradescope',
    capturedAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    items: [{ name: kc.name, grade: '0.0 / 2.0' }],
  };
  const first = I.ingest(DATA, future, seeded());
  assert.ok(first.provenance[kc.id].at <= Date.now(), 'capture time is clamped to now');

  const later = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '2.0', outOf: '2' },
  ], 0), first);
  assert.strictEqual(later.ratings[kc.id], 'P');
});

test('a hand-set rating is not undone by a later import', () => {
  const kc = byName('Knowledge Check (LG 8.3)');
  const current = seeded();
  // What markSetByHand records in the app.
  current.ratings[kc.id] = 'P';
  current.provenance[kc.id] = { source: 'you', at: Date.now(), strength: 2 };

  const r = I.ingest(DATA, scrape('Gradescope', [
    { name: kc.name, grade: 'No Submission' },
  ], 0), current);
  assert.strictEqual(r.ratings[kc.id], 'P');
  assert.ok(/already marked by you/.test(r.overruled[0].reason), r.overruled[0].reason);
});

test('provenance survives a round trip and keeps merging correctly', () => {
  const kc = byName('Knowledge Check (LG 1.2)');
  let stateLike = I.ingest(DATA, scrape('Gradescope', [
    { name: kc.name, grade: '2.0 / 2.0' },
  ], 100), seeded());

  // Simulate save/load through JSON, as localStorage and the export file do.
  stateLike = JSON.parse(JSON.stringify({
    ratings: stateLike.ratings,
    zyScores: stateLike.zyScores,
    exams: stateLike.exams,
    provenance: stateLike.provenance,
  }));

  const after = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(kc.canvasId), name: kc.name, score: '', outOf: '2' },
  ], 0), stateLike);
  assert.strictEqual(after.ratings[kc.id], 'P');
  assert.strictEqual(after.provenance[kc.id].source, 'Gradescope');
});

test('exams and Special Topics merge on the same rules', () => {
  const first = I.ingest(DATA, scrape('Canvas', [
    { name: 'Exam 1', grade: 'Application' },
    { name: 'Special Topics Credit', grade: 'P' },
  ], 60), seeded());
  assert.strictEqual(first.exams.exam1, 'A');
  assert.strictEqual(first.specialTopics, 'P');

  const second = I.ingest(DATA, scrape('Gradescope', [
    { name: 'Exam 1', grade: 'No Submission' },
    { name: 'Special Topics Credit', grade: 'Submitted' },
  ], 0), first);
  assert.strictEqual(second.exams.exam1, 'A', 'a real exam mark is not undone');
  assert.strictEqual(second.specialTopics, 'P');
});

test('official goal ratings accumulate across sources', () => {
  const first = I.ingest(DATA, scrape('Canvas', [
    { name: 'Learning Goal 1', score: '2.0', outOf: '2' },
  ], 60), seeded());
  assert.deepStrictEqual(first.officialGoals, { 1: 'P' });

  // A Gradescope scrape mentions no goals; the recorded one must not vanish.
  const second = I.ingest(DATA, scrape('Gradescope', [
    { name: 'Knowledge Check (LG 1.1)', grade: '2.0 / 2.0' },
  ], 0), Object.assign(first, { officialGoals: first.officialGoals }));
  assert.deepStrictEqual(second.officialGoals, { 1: 'P' }, 'still there');
});

test('merging both real-shaped sources covers more than either alone', () => {
  const canvasOnly = I.ingest(DATA, scrape('Canvas', [
    { canvasId: String(byName('Week 1 Studio (LG 0.1)').canvasId), score: '2.0', outOf: '2' },
    { canvasId: String(byName('zyBooks LG 0').canvasId), score: '100.0', outOf: '100' },
    { canvasId: String(byName('Knowledge Check (LG 1.1)').canvasId), score: '', outOf: '2' },
  ], 30), seeded());

  const merged = I.ingest(DATA, scrape('Gradescope', [
    { name: 'Knowledge Check (LG 1.1)', grade: '2.0 / 2.0' },
    { name: 'Program Set-up Check (LG 0)', grade: '12.0 / 12.0' },
  ], 0), canvasOnly);

  const strong = Object.keys(merged.provenance)
    .filter((k) => merged.provenance[k].strength === I.STRENGTH.MARKED);
  assert.strictEqual(strong.length, 4, 'two from Canvas plus two only Gradescope had');
  assert.strictEqual(merged.ratings[byName('Knowledge Check (LG 1.1)').id], 'P');
  assert.strictEqual(merged.ratings[byName('Program Set-up Check (LG 0.1)').id], 'P');
  assert.strictEqual(merged.ratings[byName('zyBooks LG 0').id], 'P');
});

// --- Bookmarklet build ------------------------------------------------------

test('the bookmarklet is a valid javascript: URL with the config baked in', () => {
  const url = B.buildBookmarklet('https://grades.example.edu', 'abcdefgh-1234-5678-9abc-def012345678');
  assert.ok(url.startsWith('javascript:'));
  const body = decodeURIComponent(url.slice('javascript:'.length));
  new Function(body); // throws on a syntax error
  assert.ok(body.includes('https://grades.example.edu'));
  assert.ok(body.includes('abcdefgh-1234-5678-9abc-def012345678'));
  assert.ok(!body.includes('__ORIGIN__'), 'placeholders replaced');
  assert.ok(!body.includes('__TOKEN__'), 'placeholders replaced');
});

test('the bookmarklet stays well under the browser URL cap', () => {
  const url = B.buildBookmarklet('https://a-fairly-long-hostname.example.edu', 'x'.repeat(64));
  assert.ok(url.length < 60000, `bookmarklet is ${url.length} bytes`);
});

// --- The relay --------------------------------------------------------------

const server = require(path.join(root, 'server/server.js'));

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method, headers: { 'Content-Type': 'text/plain' } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const TOKEN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

async function relayTests() {
  await new Promise((r) => {
    if (server.listening) return r();
    server.once('listening', r);
  });

  test.async = true;

  const checks = [];
  const check = (name, fn) => checks.push({ name, fn });

  check('health reports ok', async () => {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(JSON.parse(res.body).ok, true);
  });

  check('a payload can be dropped and collected once', async () => {
    const post = await request('POST', `/api/sync/${TOKEN}`,
      JSON.stringify({ source: 'Canvas', items: [{ name: 'zyBooks LG 1', grade: 'P' }] }));
    assert.strictEqual(post.status, 204);

    const get = await request('GET', `/api/sync/${TOKEN}`);
    assert.strictEqual(get.status, 200);
    assert.strictEqual(JSON.parse(get.body).source, 'Canvas');

    const again = await request('GET', `/api/sync/${TOKEN}`);
    assert.strictEqual(again.status, 404, 'the drop is emptied as it is collected');
  });

  check('an unknown token has nothing waiting', async () => {
    const res = await request('GET', '/api/sync/ffffffff-0000-0000-0000-000000000000');
    assert.strictEqual(res.status, 404);
  });

  check('a malformed token is rejected', async () => {
    assert.strictEqual((await request('GET', '/api/sync/short')).status, 400);
    assert.strictEqual((await request('GET', '/api/sync/has%20space%20chars!!')).status, 400);
  });

  check('non-JSON and wrong-shaped bodies are rejected', async () => {
    assert.strictEqual((await request('POST', `/api/sync/${TOKEN}`, 'not json')).status, 400);
    assert.strictEqual((await request('POST', `/api/sync/${TOKEN}`, '{"nope":1}')).status, 400);
    assert.strictEqual(
      (await request('POST', `/api/sync/${TOKEN}`,
        JSON.stringify({ items: new Array(401).fill({ name: 'x' }) }))).status,
      400,
    );
  });

  check('an oversized body is refused', async () => {
    const huge = JSON.stringify({ items: [{ name: 'x'.repeat(200 * 1024) }] });
    const res = await request('POST', `/api/sync/${TOKEN}`, huge);
    assert.ok(res.status === 413 || res.status === 400, `got ${res.status}`);
  });

  check('the POST route answers CORS preflight', async () => {
    const res = await request('OPTIONS', `/api/sync/${TOKEN}`);
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], '*');
  });

  check('the GET route does not hand out CORS access', async () => {
    const res = await request('GET', `/api/sync/${TOKEN}`);
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined,
      'only the app, same origin, may collect a payload');
  });

  check('health reports how many bytes are held', async () => {
    const before = JSON.parse((await request('GET', '/api/health')).body);
    assert.strictEqual(typeof before.pendingBytes, 'number');

    const token = 'bbbbbbbb-cccc-dddd-eeee-ffff00001111';
    await request('POST', `/api/sync/${token}`,
      JSON.stringify({ source: 'Canvas', items: [{ name: 'zyBooks LG 1', grade: 'P' }] }));
    const during = JSON.parse((await request('GET', '/api/health')).body);
    assert.ok(during.pendingBytes > before.pendingBytes, 'bytes go up when a payload lands');

    await request('GET', `/api/sync/${token}`);
    const after = JSON.parse((await request('GET', '/api/health')).body);
    assert.strictEqual(after.pendingBytes, before.pendingBytes,
      'collecting a payload frees its bytes again');
  });

  check('re-syncing the same token does not double-count its bytes', async () => {
    const token = 'cccccccc-dddd-eeee-ffff-000011112222';
    const body = JSON.stringify({ source: 'Canvas', items: [{ name: 'zyBooks LG 2', grade: 'P' }] });
    const baseline = JSON.parse((await request('GET', '/api/health')).body).pendingBytes;

    await request('POST', `/api/sync/${token}`, body);
    const once = JSON.parse((await request('GET', '/api/health')).body).pendingBytes;
    await request('POST', `/api/sync/${token}`, body);
    const twice = JSON.parse((await request('GET', '/api/health')).body).pendingBytes;
    assert.strictEqual(once, twice, 'the second post replaces the first');

    await request('GET', `/api/sync/${token}`);
    assert.strictEqual(JSON.parse((await request('GET', '/api/health')).body).pendingBytes, baseline);
  });

  check('static files are served from an allow-list', async () => {
    assert.strictEqual((await request('GET', '/')).status, 200);
    assert.strictEqual((await request('GET', '/js/engine.js')).status, 200);
    assert.strictEqual((await request('GET', '/server/server.js')).status, 404);
    assert.strictEqual((await request('GET', '/../package.json')).status, 404);
    assert.strictEqual((await request('GET', '/README.md')).status, 404);
  });

  check('responses carry the basic hardening headers', async () => {
    const res = await request('GET', '/');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'DENY');
  });

  for (const c of checks) {
    try { await c.fn(); passed++; } catch (err) { failures.push({ name: c.name, message: err.message }); }
  }
}

// --- Run --------------------------------------------------------------------

(async () => {
  for (const t of tests) {
    try { t.fn(); passed++; } catch (err) { failures.push({ name: t.name, message: err.message }); }
  }
  await relayTests();

  server.close();
  if (failures.length) {
    console.log(`\n${passed} passed, ${failures.length} failed\n`);
    failures.forEach((f) => console.log(`  FAIL  ${f.name}\n        ${f.message}`));
    process.exit(1);
  }
  console.log(`\n${passed} tests passed\n`);
})();
