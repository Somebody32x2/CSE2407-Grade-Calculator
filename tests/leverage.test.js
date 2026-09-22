/**
 * Tests for the cross-reference and "can this still help?" analysis.
 *
 * Run: node tests/leverage.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const E = require(path.join(root, 'js/engine.js'));
const S = require(path.join(root, 'js/syllabus.js'));
const I = require(path.join(root, 'js/ingest.js'));
const L = require(path.join(root, 'js/leverage.js'));
const RAW = (0, eval)(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + '; ASSESSMENT_DATA');
const DATA = S.applySyllabus(RAW);

const RELATIONS = L.buildRelations(DATA, I);
const byId = {};
DATA.assessments.forEach((a) => { byId[a.id] = a; });

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failures.push({ name, message: err.message }); }
}

function idOf(name) {
  const hit = DATA.assessments.find((a) => a.name === name);
  if (!hit) throw new Error('no such assessment: ' + name);
  return hit.id;
}

function score(ratings) {
  return E.calculateGrades(DATA, ratings, { exam1: null, exam2: null, exam3: null });
}

function allS() {
  const r = {};
  DATA.assessments.forEach((a) => { r[a.id] = 'S'; });
  return r;
}

/** Ids LG 0 scores. LG 0 takes the second-lowest, so these are never seeded. */
const LG0_IDS = new Set();
Object.values(DATA.learningGoals['0'].subgoals || {})
  .forEach((sg) => sg.assessments.forEach((i) => LG0_IDS.add(i)));
(DATA.learningGoals['0'].global_assessments || []).forEach((i) => LG0_IDS.add(i));

/**
 * What the app actually starts from: S everywhere the second-highest rule
 * applies, and nothing at all in LG 0, where an assumed S would drag the
 * second-lowest down.
 */
function seeded() {
  const r = {};
  DATA.assessments.forEach((a) => { if (!LG0_IDS.has(a.id)) r[a.id] = 'S'; });
  return r;
}

function leverage(id, ratings) {
  return L.assessmentLeverage(id, RELATIONS, score(ratings), byId, ratings);
}

// --- Where an assessment counts --------------------------------------------

test('an assessment named for two subgoals is recorded in both', () => {
  const lv = leverage(idOf('MCQs: Analysis (LG 2.1, 2.2)'), allS());
  assert.deepStrictEqual(lv.places.map((p) => p.label), ['2.1', '2.2']);
  assert.strictEqual(lv.countsInSeveral, true);
});

test('exactly the nine multi-subgoal assessments are flagged', () => {
  const ratings = allS();
  const multi = DATA.assessments
    .filter((a) => leverage(a.id, ratings).countsInSeveral)
    .map((a) => a.name);
  assert.strictEqual(multi.length, 9, multi.join(' | '));
  multi.forEach((name) => {
    assert.ok(/\(LG \d+\.\d+, \d+\.\d+\)/.test(name), name + ' should name both subgoals');
  });
});

test('a zyBooks assessment is recorded as its goal\'s global', () => {
  const lv = leverage(idOf('zyBooks LG 5'), allS());
  assert.deepStrictEqual(lv.places.map((p) => p.label), ['LG 5 global']);
});

// --- The same work graded twice --------------------------------------------

test('a writeup is paired with its typesetting twin in LG 0.3', () => {
  const lv = leverage(idOf('Sorting Program Writeup (LG 3.1)'), allS());
  assert.strictEqual(lv.partners.length, 1);
  assert.strictEqual(lv.partners[0].name, 'Sorting Program Writeup (LG 3.1) Typesetting');
  assert.deepStrictEqual(lv.partners[0].places.map((p) => p.label), ['0.3']);
});

test('the pairing is by LG tag, so 3.1 does not pair with 3.2', () => {
  const lv = leverage(idOf('Sorting Program Writeup (LG 3.2) Typesetting'), allS());
  assert.deepStrictEqual(lv.partners.map((p) => p.name), ['Sorting Program Writeup (LG 3.2)']);
});

test('a studio is paired with its participation entry in LG 0.4', () => {
  const lv = leverage(idOf('Week 2 Studio (LG 1.1, 1.2)'), allS());
  assert.deepStrictEqual(lv.partners.map((p) => p.name), ['Week 2 Studio Participation (LG 0.2)']);
  assert.deepStrictEqual(lv.partners[0].places.map((p) => p.label), ['0.4']);
});

test('one participation entry can pair with two content entries', () => {
  const lv = leverage(idOf('Week 4 Studio Participation (LG 0.2)'), allS());
  assert.deepStrictEqual(lv.partners.map((p) => p.name).sort(),
    ['Week 4 Studio (LG 3.1)', 'Week 4 Studio (LG 3.2)']);
});

test('a pairing inside LG 0 across subgoals is still found', () => {
  const lv = leverage(idOf('Week 1 Studio (LG 0.1)'), allS());
  assert.deepStrictEqual(lv.partners.map((p) => p.name), ['Week 1 Studio Participation (LG 0.2)']);
});

test('a generic name does not link thirteen unrelated assessments', () => {
  // "Knowledge Check" appears 13 times; only the tag-matched pair may link.
  const lv = leverage(idOf('Knowledge Check (LG 0.1)'), allS());
  assert.deepStrictEqual(lv.partners, [], 'LG 0.1 knowledge check stands alone');

  const tagged = leverage(idOf('Knowledge Check (LG 4.1, 4.2)'), allS());
  assert.deepStrictEqual(tagged.partners.map((p) => p.name),
    ['Knowledge Check (LG 4.1, 4.2) Typesetting']);
});

test('the AVL writeups pair by name despite their LG tags disagreeing', () => {
  // The typesetting rows are tagged LG 4.x though AVL trees are LG 5, so the
  // tag route finds nothing and the name route has to carry it.
  const lv = leverage(idOf('AVL Program Writeup (LG 5.1)'), allS());
  const names = lv.partners.map((p) => p.name);
  assert.ok(names.some((n) => /Typesetting/.test(n)), names.join(' | '));
});

test('a partner must be graded somewhere this assessment is not', () => {
  const ratings = allS();
  DATA.assessments.forEach((a) => {
    leverage(a.id, ratings).partners.forEach((partner) => {
      const mine = leverage(a.id, ratings).places.map((p) => p.label);
      assert.ok(
        partner.places.some((p) => mine.indexOf(p.label) === -1),
        a.name + ' paired with ' + partner.name + ' but they share all their subgoals',
      );
    });
  });
});

// --- Whether it can still help ---------------------------------------------

test('from a fresh start nothing is written off', () => {
  const ratings = seeded();
  const statuses = {};
  DATA.assessments.forEach((a) => {
    const st = leverage(a.id, ratings).status;
    statuses[st] = (statuses[st] || 0) + 1;
  });
  // Everything the second-highest rule scores has headroom to be lifted.
  assert.strictEqual(statuses['can-help'], 59);
  // Everything LG 0 scores is unmarked, and the mark it gets can cost
  // points, so it is pending rather than spent.
  assert.strictEqual(statuses.pending, 34);
  assert.strictEqual(statuses.uncounted, 2, 'the two Special Topics rows');
  assert.strictEqual(statuses['no-gain'], undefined, 'nothing is spent on day one');
});

test('an assumed S in LG 0 would have written the whole goal off', () => {
  // The bug this seeding avoids: with every LG 0 row assumed S, the
  // second-lowest of all-S is S, and no later grade can lift it.
  const assumed = allS();
  assert.strictEqual(score(assumed).goals['0'].rating, 'S');
  assert.strictEqual(leverage(idOf('Week 1 Studio (LG 0.1)'), assumed).canHelp, false);

  // Left unmarked, LG 0 starts clean and every row still counts.
  const real = seeded();
  assert.strictEqual(score(real).goals['0'].rating, 'P');
  assert.strictEqual(leverage(idOf('Week 1 Studio (LG 0.1)'), real).status, 'pending');
});

test('an assessment already at P has nothing more to give', () => {
  const ratings = allS();
  const id = idOf('Knowledge Check (LG 3.1)');
  ratings[id] = 'P';
  assert.strictEqual(leverage(id, ratings).status, 'at-p');
});

test('once a subgoal reaches P, its remaining assessments cannot help it', () => {
  const ids = DATA.learningGoals['3'].subgoals['3.1'].assessments;
  const ratings = allS();
  // Two P grades are enough for second-highest to read P.
  ratings[ids[0]] = 'P';
  ratings[ids[1]] = 'P';
  assert.strictEqual(score(ratings).goals['3'].subgoals['3.1'].rating, 'P');

  const stillS = leverage(ids[3], ratings);
  assert.strictEqual(ratings[ids[3]], 'S');
  assert.strictEqual(stillS.status, 'no-gain', 'raising it would not move 3.1');
});

test('"no gain" here still reports the work mattering elsewhere', () => {
  const ids = DATA.learningGoals['3'].subgoals['3.1'].assessments;
  const ratings = allS();
  ratings[ids[0]] = 'P';
  ratings[ids[1]] = 'P';

  const studio = leverage(idOf('Week 4 Studio (LG 3.1)'), ratings);
  assert.strictEqual(studio.status, 'no-gain', 'nothing left to win in 3.1');
  assert.strictEqual(studio.workCanHelp, true, 'but participation still counts in 0.4');

  const check = leverage(idOf('Knowledge Check (LG 3.1)'), ratings);
  assert.strictEqual(check.status, 'no-gain');
  assert.strictEqual(check.workCanHelp, false, 'this one is genuinely spent');
});

// --- Still owed on LG 0's axis ---------------------------------------------

/**
 * Lift subgoal 3.1 to P without touching the writeup or the studio, so the
 * question "can this row still help?" is answered by the subgoal being full
 * rather than by the row's own rating.
 */
function maxed31() {
  const ratings = seeded();
  ratings[idOf('MCQs: Searching and Sorting (LG 3.1, 3.2)')] = 'P';
  ratings[idOf('Knowledge Check (LG 3.1)')] = 'P';
  return ratings;
}

test('a writeup whose content is maxed is still owed for typesetting', () => {
  const ratings = maxed31();
  assert.strictEqual(score(ratings).goals['3'].subgoals['3.1'].rating, 'P');

  const lv = leverage(idOf('Sorting Program Writeup (LG 3.1)'), ratings);
  assert.strictEqual(lv.status, 'no-gain', 'the content rating cannot rise');
  assert.deepStrictEqual(lv.axesLeft, ['typesetting'],
    'but the writeup is still how the LG 0.3 typesetting mark is earned');
  assert.strictEqual(lv.stillOwedTo.length, 1);
  assert.strictEqual(lv.stillOwedTo[0].name, 'Sorting Program Writeup (LG 3.1) Typesetting');
});

test('a studio whose content is maxed is still owed for participation', () => {
  // Week 7's studio is graded for one subgoal only, so once 4.3 is full the
  // participation mark in LG 0.4 is the whole of what is left.
  const ratings = seeded();
  ratings[idOf('MCQs: recurrences and master theorem (LG 4.3)')] = 'P';
  ratings[idOf('Knowledge Check (LG 4.3)')] = 'P';

  const lv = leverage(idOf('Week 7 Studio (LG 4.3)'), ratings);
  assert.strictEqual(lv.status, 'no-gain');
  assert.deepStrictEqual(lv.axesLeft, ['participation']);
});

test('a second content subgoal still open outranks the axis', () => {
  // Week 4's studio is graded for 3.1 and 3.2 separately. With 3.1 full but
  // 3.2 open, real content gain is still on the table, so the row must not
  // be reduced to "participation".
  const lv = leverage(idOf('Week 4 Studio (LG 3.1)'), maxed31());
  assert.strictEqual(lv.status, 'no-gain', 'nothing more to win in 3.1 itself');
  assert.strictEqual(lv.workCanHelp, true);
  assert.deepStrictEqual(lv.axesLeft, [], 'Week 4 Studio (LG 3.2) is still open');
});

test('once 0.3 is settled at P the writeup really is no gain', () => {
  // The whole point of second-lowest: a subgoal at P cannot be raised by a
  // further grade, and with two clean marks banked a third bad one cannot
  // pull it down either. So there is nothing left for this work to win.
  const ratings = maxed31();
  const ts = DATA.learningGoals['0'].subgoals['0.3'].assessments;
  ratings[ts[0]] = 'P';
  ratings[ts[1]] = 'P';
  assert.strictEqual(score(ratings).goals['0'].subgoals['0.3'].rating, 'P');

  const lv = leverage(idOf('Sorting Program Writeup (LG 3.1)'), ratings);
  assert.strictEqual(lv.status, 'no-gain');
  assert.deepStrictEqual(lv.axesLeft, [], 'truly no gain, so no typesetting pill');
  assert.strictEqual(lv.workCanHelp, false);
});

test('one banked S in 0.3 spends the forgiveness, and the work counts again', () => {
  const ratings = maxed31();
  const ts = DATA.learningGoals['0'].subgoals['0.3'].assessments;
  ratings[ts[0]] = 'P';
  ratings[ts[1]] = 'P';
  // A weak mark on some *other* typesetting row, leaving this writeup's own
  // typesetting entry still unmarked.
  ratings[idOf('Sorting Program Writeup (LG 3.2) Typesetting')] = 'S';
  // Second-lowest still reads P: one weak mark is forgiven.
  assert.strictEqual(score(ratings).goals['0'].subgoals['0.3'].rating, 'P');

  // But a second weak mark would not be, so the next writeup matters again.
  const lv = leverage(idOf('Sorting Program Writeup (LG 3.1)'), ratings);
  assert.deepStrictEqual(lv.axesLeft, ['typesetting']);
});

test('a second-lowest subgoal is never raised by one more grade', () => {
  const ts = DATA.learningGoals['0'].subgoals['0.3'].assessments;
  [[], ['P'], ['P', 'P'], ['D', 'P'], ['D', 'D', 'P'], ['S', 'P', 'P']].forEach((marks) => {
    const ratings = seeded();
    marks.forEach((m, i) => { ratings[ts[i]] = m; });
    const before = score(ratings).goals['0'].subgoals['0.3'].rating;

    const after = Object.assign({}, ratings);
    after[ts[marks.length]] = 'P';
    const raised = score(after).goals['0'].subgoals['0.3'].rating;

    assert.strictEqual(raised, before,
      JSON.stringify(marks) + ' was ' + before + ', a further P made it ' + raised);
  });
});

test('nothing is owed on an axis once that LG 0 subgoal is itself at P', () => {
  const ratings = allS();
  DATA.learningGoals['3'].subgoals['3.1'].assessments.forEach((i) => { ratings[i] = 'P'; });
  DATA.learningGoals['0'].subgoals['0.3'].assessments.forEach((i) => { ratings[i] = 'P'; });
  DATA.learningGoals['0'].subgoals['0.4'].assessments.forEach((i) => { ratings[i] = 'P'; });

  const lv = leverage(idOf('Sorting Program Writeup (LG 3.1)'), ratings);
  assert.strictEqual(lv.status, 'at-p', 'its own rating is P now');

  // And a row still at S with everything around it maxed really is spent.
  const check = leverage(idOf('Knowledge Check (LG 3.1)'), allS());
  assert.deepStrictEqual(check.axesLeft, []);
});

test('an axis is only claimed when every open partner is one, and in LG 0', () => {
  // The typesetting row seen from the other side: what is still open for it
  // is the content mark in LG 3.1, which is not an LG 0 axis grade.
  const ratings = allS();
  DATA.learningGoals['0'].subgoals['0.3'].assessments.forEach((i) => { ratings[i] = 'P'; });

  const lv = leverage(idOf('Sorting Program Writeup (LG 3.1) Typesetting'), ratings);
  assert.strictEqual(lv.status, 'at-p');
  assert.deepStrictEqual(lv.axesLeft, [], 'the content side is not an axis');
});

test('a genuinely spent row claims no axis', () => {
  const ids = DATA.learningGoals['3'].subgoals['3.1'].assessments;
  const ratings = allS();
  ratings[ids[0]] = 'P';
  ratings[ids[1]] = 'P';

  const check = leverage(idOf('Knowledge Check (LG 3.1)'), ratings);
  assert.strictEqual(check.status, 'no-gain');
  assert.strictEqual(check.workCanHelp, false);
  assert.deepStrictEqual(check.axesLeft, [], 'nothing anywhere still needs it');
});

test('an assessment feeding two subgoals still helps while either is below P', () => {
  const mcq = idOf('MCQs: Searching and Sorting (LG 3.1, 3.2)');
  const ratings = allS();
  // Max out 3.1 only.
  DATA.learningGoals['3'].subgoals['3.1'].assessments.forEach((i) => { ratings[i] = 'P'; });
  ratings[mcq] = 'D'; // it sits in both 3.1 and 3.2

  const lv = leverage(mcq, ratings);
  assert.strictEqual(lv.places.length, 2);
  assert.strictEqual(lv.places.find((p) => p.label === '3.1').atP, true);
  assert.strictEqual(lv.places.find((p) => p.label === '3.2').atP, false);
  assert.strictEqual(lv.status, 'can-help', '3.2 still needs it');
});

test('with everything at P nothing can help, and nothing is stranded', () => {
  const ratings = {};
  DATA.assessments.forEach((a) => { ratings[a.id] = 'P'; });
  let canHelp = 0;
  let stranded = 0;
  DATA.assessments.forEach((a) => {
    const lv = leverage(a.id, ratings);
    if (lv.canHelp) canHelp++;
    if (lv.status === 'no-gain' && !lv.workCanHelp) stranded++;
  });
  assert.strictEqual(canHelp, 0);
  assert.strictEqual(stranded, 0, 'everything is at-p, which is not the same as spent');
});

test('a global assessment at P leaves its zyBooks with no gain', () => {
  const ratings = allS();
  const zy = idOf('zyBooks LG 6');
  // A global goal takes the lowest grade, so P needs the grade itself to be P.
  ratings[zy] = 'P';
  assert.strictEqual(score(ratings).goals['6'].global.rating, 'P');
  assert.strictEqual(leverage(zy, ratings).status, 'at-p');
});

test('the Special Topics rows count nowhere and are reported as such', () => {
  const ratings = allS();
  ['Special Topics Assignment', 'Special Topics Credit'].forEach((name) => {
    const lv = leverage(idOf(name), ratings);
    assert.deepStrictEqual(lv.places, []);
    assert.strictEqual(lv.status, 'uncounted');
    assert.strictEqual(lv.canHelp, false);
  });
});

// --- Report -----------------------------------------------------------------

if (failures.length) {
  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  failures.forEach((f) => console.log(`  FAIL  ${f.name}\n        ${f.message}`));
  process.exit(1);
}
console.log(`\n${passed} tests passed\n`);
