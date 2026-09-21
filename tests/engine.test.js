/**
 * Engine tests. Run with: node tests/engine.test.js
 *
 * Each rule the syllabus states is checked against hand-worked cases, so a
 * change that alters how a grade is worked out fails here rather than
 * silently.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const E = require(path.join(root, 'js/engine.js'));
const S = require(path.join(root, 'js/syllabus.js'));
const RAW = (0, eval)(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + '; ASSESSMENT_DATA');
const DATA = S.applySyllabus(RAW);

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, message: err.message });
  }
}

const noExams = { exam1: null, exam2: null, exam3: null };
const allExamsA = { exam1: 'A', exam2: 'A', exam3: 'A' };

function ratingsAll(value) {
  const r = {};
  DATA.assessments.forEach((a) => { r[a.id] = value; });
  return r;
}

function lg0(subgoalId) {
  return DATA.learningGoals['0'].subgoals[subgoalId].assessments;
}

function score(ratings, exams = noExams, options) {
  return E.calculateGrades(DATA, ratings, exams, options);
}

// --- Rating -> points -------------------------------------------------------

test('P/D/S are worth 2/1/0 points', () => {
  assert.deepStrictEqual(E.RATING_POINTS, { P: 2, D: 1, S: 0 });
});

test('A/B/T exams are worth 4/3/1 points', () => {
  assert.deepStrictEqual(E.EXAM_POINTS, { A: 4, B: 3, T: 1 });
});

test('an ungraded exam is worth 0, not 1', () => {
  assert.strictEqual(score(ratingsAll('P'), { exam1: 'A', exam2: null, exam3: null }).examPoints, 4);
});

// --- zyBooks 0-10 conversion ------------------------------------------------

test('zyBooks 9.0 and above is P', () => {
  assert.strictEqual(E.zyBooksScoreToRating(10), 'P');
  assert.strictEqual(E.zyBooksScoreToRating(9.0), 'P');
});

test('zyBooks 7.0 up to 9.0 is D', () => {
  assert.strictEqual(E.zyBooksScoreToRating(8.99), 'D');
  assert.strictEqual(E.zyBooksScoreToRating(7.0), 'D');
});

test('zyBooks below 7.0 is S', () => {
  assert.strictEqual(E.zyBooksScoreToRating(6.99), 'S');
  assert.strictEqual(E.zyBooksScoreToRating(0), 'S');
});

test('a blank zyBooks score is ungraded, not S', () => {
  assert.strictEqual(E.zyBooksScoreToRating(''), null);
  assert.strictEqual(E.zyBooksScoreToRating(null), null);
  assert.strictEqual(E.zyBooksScoreToRating('abc'), null);
});

// --- Subgoal rule -----------------------------------------------------------

test('a subgoal with no grades defaults to P', () => {
  assert.strictEqual(E.subgoalRating([], false).rating, 'P');
});

test('a subgoal with one grade uses that grade', () => {
  assert.strictEqual(E.subgoalRating(['S'], false).rating, 'S');
});

test('a subgoal uses the second-highest of several grades', () => {
  assert.strictEqual(E.subgoalRating(['P', 'P', 'S'], false).rating, 'P');
  assert.strictEqual(E.subgoalRating(['P', 'D', 'S'], false).rating, 'D');
  assert.strictEqual(E.subgoalRating(['S', 'S', 'P'], false).rating, 'S');
});

test('a second-lowest subgoal uses the second-lowest grade', () => {
  assert.strictEqual(E.subgoalRating(['P', 'P', 'S'], true).rating, 'P');
  assert.strictEqual(E.subgoalRating(['P', 'S', 'S'], true).rating, 'S');
  assert.strictEqual(E.subgoalRating(['P', 'D', 'S'], true).rating, 'D');
});

test('with two grades, second-highest is the lower and second-lowest the higher', () => {
  assert.strictEqual(E.subgoalRating(['P', 'S'], false).rating, 'S');
  assert.strictEqual(E.subgoalRating(['P', 'S'], true).rating, 'P');
});

// --- Global goal rule -------------------------------------------------------

test('a global goal takes the lowest grade', () => {
  assert.strictEqual(E.globalRating(['P', 'P', 'D']).rating, 'D');
});

test('a global goal relaxes S to D', () => {
  assert.strictEqual(E.globalRating(['P', 'S']).rating, 'D');
  assert.strictEqual(E.globalRating(['S']).rating, 'D');
});

test('a global goal with no grades defaults to P', () => {
  assert.strictEqual(E.globalRating([]).rating, 'P');
});

// --- Learning goal rule -----------------------------------------------------

test('a learning goal is P only when every part is P', () => {
  assert.strictEqual(E.goalRating(['P', 'P'], 'P'), 'P');
  assert.strictEqual(E.goalRating(['P', 'P'], 'D'), 'D');
  assert.strictEqual(E.goalRating(['P', 'D'], 'P'), 'D');
});

test('any S in a learning goal drops the whole goal to S', () => {
  assert.strictEqual(E.goalRating(['P', 'S'], 'P'), 'S');
  assert.strictEqual(E.goalRating(['D', 'S'], 'P'), 'S');
});

test('a goal with no subgoals falls back to its global rating', () => {
  assert.strictEqual(E.goalRating([], 'D'), 'D');
});

// --- Points to letter grade -------------------------------------------------

test('every point total maps to the published letter', () => {
  const expected = {
    30: 'A+', 29: 'A', 28: 'A-', 27: 'B+', 26: 'B', 25: 'B-',
    24: 'C+', 23: 'C', 22: 'C-', 21: 'D+', 20: 'D', 19: 'F', 0: 'F',
  };
  for (const [points, letter] of Object.entries(expected)) {
    assert.strictEqual(E.gradeFromPoints(Number(points), 'P').grade, letter, `${points} points`);
  }
});

test('A-, A and A+ are capped at B+ when LG0 is not P', () => {
  for (const points of [28, 29, 30]) {
    const result = E.gradeFromPoints(points, 'D');
    assert.strictEqual(result.grade, 'B+', `${points} points with LG0=D`);
    assert.strictEqual(result.gated, true);
  }
});

test('B+ and below are untouched by the LG0 gate', () => {
  assert.strictEqual(E.gradeFromPoints(27, 'S').grade, 'B+');
  assert.strictEqual(E.gradeFromPoints(27, 'S').gated, false);
  assert.strictEqual(E.gradeFromPoints(20, 'S').grade, 'D');
});

// --- Whole-course scenarios -------------------------------------------------

test('a perfect record earns 30 points and an A+', () => {
  const r = score(ratingsAll('P'), allExamsA);
  assert.strictEqual(r.lgPoints, 18);
  assert.strictEqual(r.examPoints, 12);
  assert.strictEqual(r.totalPoints, 30);
  assert.strictEqual(r.letterGrade, 'A+');
});

test('an all-S record earns 0 points and an F', () => {
  const r = score(ratingsAll('S'));
  assert.strictEqual(r.totalPoints, 0);
  assert.strictEqual(r.letterGrade, 'F');
});

test('an empty record gives every goal the benefit of the doubt', () => {
  const r = score(ratingsAll(null));
  assert.strictEqual(r.lgPoints, 18, 'ungraded goals default to P');
  assert.strictEqual(r.examPoints, 0);
});

test('an empty record reports all 18 points as provisional', () => {
  const r = score(ratingsAll(null));
  assert.strictEqual(r.anythingGraded, false);
  assert.strictEqual(r.provisionalGoals, 9);
  assert.strictEqual(r.provisionalPoints, 18, 'every point rests on the default');
  assert.strictEqual(r.provisionalPoints, r.totalPoints);
});

test('grading one assessment makes that goal stop being provisional', () => {
  const ratings = ratingsAll(null);
  ratings[DATA.learningGoals['5'].subgoals['5.1'].assessments[0]] = 'P';
  const r = score(ratings);
  assert.strictEqual(r.anythingGraded, true);
  assert.strictEqual(r.goals['5'].provisional, false);
  assert.strictEqual(r.goals['4'].provisional, true);
  assert.strictEqual(r.provisionalGoals, 8);
  assert.strictEqual(r.provisionalPoints, 16);
});

test('a graded exam counts as evidence even with no assessments graded', () => {
  const r = score(ratingsAll(null), { exam1: 'B', exam2: null, exam3: null });
  assert.strictEqual(r.anythingGraded, true);
  assert.strictEqual(r.provisionalGoals, 9, 'the goals themselves are still ungraded');
});

test('provisional points fall to zero once everything is graded', () => {
  const r = score(ratingsAll('D'), allExamsA);
  assert.strictEqual(r.provisionalPoints, 0);
  assert.strictEqual(r.provisionalGoals, 0);
});

test('a goal graded only through its global assessment is not provisional', () => {
  const ratings = ratingsAll(null);
  ratings[DATA.learningGoals['3'].global_assessments[0]] = 'D';
  const r = score(ratings);
  assert.strictEqual(r.goals['3'].provisional, false);
  assert.strictEqual(r.goals['3'].graded, 1);
});

test('a corrupted rating is ignored rather than poisoning the total', () => {
  const ratings = ratingsAll('P');
  ratings[35] = 'X';
  ratings[36] = 7;
  const r = score(ratings, allExamsA);
  assert.strictEqual(Number.isFinite(r.totalPoints), true);
  assert.strictEqual(r.totalPoints, 30, 'bad values drop out, remaining grades still count');
});

test('a corrupted exam rating scores 0 instead of NaN', () => {
  const r = score(ratingsAll('P'), { exam1: 'Z', exam2: 'A', exam3: null });
  assert.strictEqual(r.examPoints, 4);
});

test('LG0 at D caps an otherwise perfect record at B+', () => {
  const ratings = ratingsAll('P');
  DATA.learningGoals['0'].subgoals['0.3'].assessments.forEach((id) => { ratings[id] = 'D'; });
  const r = score(ratings, allExamsA);
  assert.strictEqual(r.goals['0'].rating, 'D');
  assert.strictEqual(r.totalPoints, 29);
  assert.strictEqual(r.letterGrade, 'B+');
  assert.strictEqual(r.gatedByLG0, true);
  assert.strictEqual(r.uncappedGrade, 'A');
});

test('the bar is 9 goals, 3 exams and the bonus, totalling 32 slots', () => {
  const r = score(ratingsAll('P'), allExamsA, { specialTopics: 'P' });
  assert.strictEqual(r.segments.length, 13);
  assert.strictEqual(r.segments.filter((s) => s.kind === 'goal').length, 9);
  assert.strictEqual(r.segments.filter((s) => s.kind === 'exam').length, 3);
  assert.strictEqual(r.segments.filter((s) => s.kind === 'bonus').length, 1);
  assert.strictEqual(r.segments.reduce((n, s) => n + s.capacity, 0), 32);
  assert.strictEqual(r.segments.reduce((n, s) => n + s.filled, 0), 32);
});

test('the next rung reports the points still needed', () => {
  const r = score(ratingsAll('P'), { exam1: 'T', exam2: 'T', exam3: 'T' });
  assert.strictEqual(r.totalPoints, 21);
  assert.strictEqual(r.nextRung.grade, 'C-');
  assert.strictEqual(r.nextRung.pointsNeeded, 1);
});

test('the next rung flags when LG0 blocks it', () => {
  const ratings = ratingsAll('P');
  DATA.learningGoals['0'].subgoals['0.3'].assessments.forEach((id) => { ratings[id] = 'D'; });
  const r = score(ratings, { exam1: 'A', exam2: 'A', exam3: 'B' });
  assert.strictEqual(r.totalPoints, 28);
  assert.strictEqual(r.letterGrade, 'B+');
  assert.strictEqual(r.gatedByLG0, true);
});

// --- The second-lowest rule (syllabus 5.2) ---------------------------------

test('LG 0 regains the two subgoals the syllabus lists', () => {
  const subgoals = DATA.learningGoals['0'].subgoals;
  assert.deepStrictEqual(Object.keys(subgoals), ['0.1', '0.2', '0.3', '0.4']);
  assert.strictEqual(subgoals['0.1'].name, 'Baseline and Tools');
  assert.strictEqual(subgoals['0.2'].name, 'Commitment and Quality Feedback');
  assert.strictEqual(subgoals['0.1'].assessments.length, 7);
  assert.strictEqual(subgoals['0.2'].assessments.length, 2);
});

test('reconciliation leaves every other goal untouched', () => {
  for (const key of Object.keys(RAW.learningGoals)) {
    if (key === '0') continue;
    assert.deepStrictEqual(
      Object.keys(DATA.learningGoals[key].subgoals),
      Object.keys(RAW.learningGoals[key].subgoals),
      `LG${key} subgoals`,
    );
  }
});

test('only the two Special Topics rows remain outside a subgoal', () => {
  const placed = new Set();
  Object.values(DATA.learningGoals).forEach((g) => {
    Object.values(g.subgoals || {}).forEach((sg) => sg.assessments.forEach((i) => placed.add(i)));
    (g.global_assessments || []).forEach((i) => placed.add(i));
  });
  const left = DATA.assessments.filter((a) => !placed.has(a.id)).map((a) => a.name);
  assert.deepStrictEqual(left, ['Special Topics Assignment', 'Special Topics Credit']);
});

test('second-lowest applies to every LG 0 subgoal, by default', () => {
  assert.deepStrictEqual(E.SECOND_LOWEST_GOALS, ['0']);
  const r = score(ratingsAll('P'));
  for (const sg of Object.values(r.goals['0'].subgoals)) {
    assert.strictEqual(sg.useSecondLowest, true, sg.id);
  }
});

test('second-highest applies to every other goal', () => {
  const r = score(ratingsAll('P'));
  for (const key of Object.keys(DATA.learningGoals)) {
    if (key === '0') continue;
    for (const sg of Object.values(r.goals[key].subgoals)) {
      assert.strictEqual(sg.useSecondLowest, false, `LG${key} ${sg.id}`);
    }
  }
});

test('one missed studio does not move Collaboration, two do', () => {
  const ids = lg0('0.4');
  const one = ratingsAll('P');
  one[ids[0]] = 'S';
  assert.strictEqual(score(one).goals['0'].subgoals['0.4'].rating, 'P', 'leeway of one');

  const two = ratingsAll('P');
  two[ids[0]] = 'S';
  two[ids[1]] = 'S';
  assert.strictEqual(score(two).goals['0'].subgoals['0.4'].rating, 'S');
});

test('the restored subgoals can now sink LG 0', () => {
  const ratings = ratingsAll('P');
  lg0('0.2').forEach((id) => { ratings[id] = 'S'; });
  const r = score(ratings, allExamsA);
  assert.strictEqual(r.goals['0'].subgoals['0.2'].rating, 'S');
  assert.strictEqual(r.goals['0'].rating, 'S');
  assert.strictEqual(r.letterGrade, 'B+', 'LG0 = S loses 2 points and trips the gate');
});

// --- Special Topics (syllabus 6) -------------------------------------------

test('Special Topics adds up to 2 points on top of the 30', () => {
  const perfect = score(ratingsAll('P'), allExamsA, { specialTopics: 'P' });
  assert.strictEqual(perfect.specialTopicsPoints, 2);
  assert.strictEqual(perfect.totalPoints, 32);
  assert.strictEqual(perfect.maxPoints, 32);
  assert.strictEqual(perfect.letterGrade, 'A+', 'above 30 is still A+');
});

test('Special Topics scores like any other rating', () => {
  const base = ratingsAll('P');
  assert.strictEqual(score(base, allExamsA, { specialTopics: 'D' }).totalPoints, 31);
  assert.strictEqual(score(base, allExamsA, { specialTopics: 'S' }).totalPoints, 30);
  assert.strictEqual(score(base, allExamsA, { specialTopics: null }).totalPoints, 30);
});

test('Special Topics cannot buy past the LG 0 gate', () => {
  const ratings = ratingsAll('P');
  lg0('0.3').forEach((id) => { ratings[id] = 'D'; });
  assert.strictEqual(score(ratings, allExamsA).goals['0'].rating, 'D');
  assert.strictEqual(score(ratings, allExamsA, { specialTopics: 'P' }).totalPoints, 31);
  assert.strictEqual(score(ratings, allExamsA, { specialTopics: 'P' }).letterGrade, 'B+');
});

test('Special Topics moves the letter when LG 0 is clean', () => {
  const ratings = ratingsAll('P');
  DATA.learningGoals['6'].subgoals['6.1'].assessments.forEach((id) => { ratings[id] = 'S'; });
  const without = score(ratings, allExamsA, { specialTopics: null });
  const withBonus = score(ratings, allExamsA, { specialTopics: 'P' });
  assert.strictEqual(without.totalPoints + 2, withBonus.totalPoints);
  assert.notStrictEqual(without.letterGrade, withBonus.letterGrade);
});

test('an invalid Special Topics rating scores 0', () => {
  assert.strictEqual(score(ratingsAll('P'), allExamsA, { specialTopics: 'Z' }).specialTopicsPoints, 0);
});

// --- Pass / No Pass (syllabus 6) -------------------------------------------

test('C- is the lowest passing grade', () => {
  assert.strictEqual(E.PASS_FLOOR_POINTS, 22);
  const at = score(ratingsAll('P'), { exam1: 'A', exam2: null, exam3: null });
  assert.strictEqual(at.totalPoints, 22);
  assert.strictEqual(at.letterGrade, 'C-');
  assert.strictEqual(at.passes, true);
  const below = score(ratingsAll('P'), { exam1: 'B', exam2: null, exam3: null });
  assert.strictEqual(below.totalPoints, 21);
  assert.strictEqual(below.passes, false);
});

// --- Coaching hints ---------------------------------------------------------

test('lifts-to-P counts the grades that still need raising', () => {
  assert.strictEqual(E.liftsNeeded(['P', 'P', 'S'], false), null, 'already P');
  assert.strictEqual(E.liftsNeeded(['P', 'D', 'S'], false), 1, 'one more P reaches second-highest P');
  assert.strictEqual(E.liftsNeeded(['D', 'D', 'S'], false), 2);
  assert.strictEqual(E.liftsNeeded(['P', 'P', 'S'], true), null, 'second-lowest tolerates one non-P');
  assert.strictEqual(E.liftsNeeded(['P', 'S', 'S'], true), 1);
  assert.strictEqual(E.liftsNeeded(['S', 'S', 'S'], true), 2);
  assert.strictEqual(E.liftsNeeded(['P', 'P', 'P'], true), null);
});

// --- Report -----------------------------------------------------------------

if (failures.length) {
  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  failures.forEach((f) => console.log(`  FAIL  ${f.name}\n        ${f.message}`));
  process.exit(1);
}
console.log(`\n${passed} tests passed\n`);
