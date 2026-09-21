/**
 * CSE 2407 grading engine.
 *
 * Implements the Fall 2026 points scheme:
 *   9 learning goals x (P=2, D=1, S=0)      = 18 points
 *   3 exams          x (A=4, B=3, T=1)      = 12 points
 *   Special Topics   x (P=2, D=1, S=0)      =  2 points
 *                                             --
 *                                             32 points -> letter grade
 *
 * A rating may also be null, meaning not graded. Null ratings are excluded
 * from every aggregate rather than counted as S, which is what makes the
 * syllabus rule "an ungraded subgoal counts as P" expressible.
 */

const RATING_POINTS = { P: 2, D: 1, S: 0 };
const EXAM_POINTS = { A: 4, B: 3, T: 1 };

/** Point threshold for each letter, highest first. Below 20 is F. */
const GRADE_LADDER = [
  { points: 30, grade: 'A+' },
  { points: 29, grade: 'A' },
  { points: 28, grade: 'A-' },
  { points: 27, grade: 'B+' },
  { points: 26, grade: 'B' },
  { points: 25, grade: 'B-' },
  { points: 24, grade: 'C+' },
  { points: 23, grade: 'C' },
  { points: 22, grade: 'C-' },
  { points: 21, grade: 'D+' },
  { points: 20, grade: 'D' },
];

/** Letters that require LG0 = P. Without it the grade is capped at B+. */
const GATED_GRADES = ['A+', 'A', 'A-'];
const GATE_CAP = 'B+';

/**
 * Goals whose subgoals take the second-LOWEST assessment rating.
 *
 * Syllabus 5.2 gives LG 0 its own rule: "The second-lowest assessment rating
 * associated with a subgoal will be taken as that subgoal's rating." It applies
 * to the goal as a whole. Every other goal uses the second-highest.
 */
const SECOND_LOWEST_GOALS = ['0'];

/** Syllabus 6: up to 2 extra points on top of the 30. */
const SPECIAL_TOPICS_MAX = 2;

/** Syllabus 6: C- is the lowest passing grade for Pass/No Pass students. */
const PASS_FLOOR_POINTS = 22;

/** zyBooks assessments are entered as a 0-10 score and converted to a rating. */
const ZYBOOKS_THRESHOLDS = [
  { min: 9.0, rating: 'P' },
  { min: 7.0, rating: 'D' },
];

function zyBooksScoreToRating(score) {
  if (score === null || score === undefined || score === '') return null;
  const n = Number(score);
  if (Number.isNaN(n)) return null;
  for (const t of ZYBOOKS_THRESHOLDS) {
    if (n >= t.min) return t.rating;
  }
  return 'S';
}

function isValidRating(r) {
  return r === 'P' || r === 'D' || r === 'S';
}

function isValidExamRating(r) {
  return r === 'A' || r === 'B' || r === 'T';
}

/** Highest rating first. */
function sortDescending(ratings) {
  return [...ratings].sort((a, b) => RATING_POINTS[b] - RATING_POINTS[a]);
}

/**
 * Subgoal rating from its graded assessments.
 *   0 graded  -> P, the benefit of the doubt, flagged as having no evidence
 *   1 graded  -> that rating
 *   2+ graded -> second-highest, or second-lowest for the listed subgoals
 */
function subgoalRating(ratings, useSecondLowest) {
  if (ratings.length === 0) return { rating: 'P', basis: 'no grades yet', graded: 0 };
  if (ratings.length === 1) return { rating: ratings[0], basis: 'only grade so far', graded: 1 };

  const sorted = sortDescending(ratings);
  return useSecondLowest
    ? { rating: sorted[sorted.length - 2], basis: 'second-lowest', graded: ratings.length }
    : { rating: sorted[1], basis: 'second-highest', graded: ratings.length };
}

/**
 * Global-goal rating: the minimum of every graded assessment, with S relaxed
 * to D. No graded assessments means P.
 */
function globalRating(ratings) {
  if (ratings.length === 0) return { rating: 'P', basis: 'no grades yet', graded: 0 };
  const sorted = sortDescending(ratings);
  const lowest = sorted[sorted.length - 1];
  return {
    rating: lowest === 'S' ? 'D' : lowest,
    basis: lowest === 'S' ? 'lowest grade, S relaxed to D' : 'lowest grade',
    graded: ratings.length,
  };
}

/**
 * Learning-goal rating: the highest level every subgoal and the global goal
 * reach. Any S anywhere drops the whole goal to S.
 */
function goalRating(subgoalRatings, global) {
  if (subgoalRatings.length === 0) return global;
  if (subgoalRatings.every((r) => r === 'P') && global === 'P') return 'P';
  if (subgoalRatings.some((r) => r === 'S') || global === 'S') return 'S';
  return 'D';
}

function gradeFromPoints(totalPoints, lg0Rating) {
  let grade = 'F';
  for (const rung of GRADE_LADDER) {
    if (totalPoints >= rung.points) {
      grade = rung.grade;
      break;
    }
  }
  const gated = GATED_GRADES.includes(grade) && lg0Rating !== 'P';
  return { grade: gated ? GATE_CAP : grade, uncappedGrade: grade, gated };
}

/**
 * How many more assessments in this subgoal must reach P before the subgoal
 * itself reaches P. Returns null when it is already there.
 */
function liftsNeeded(ratings, useSecondLowest) {
  const notP = ratings.filter((r) => r !== 'P').length;
  if (notP === 0) return null;
  if (ratings.length < 2) return notP;
  if (useSecondLowest) return notP <= 1 ? null : notP - 1;
  const pCount = ratings.length - notP;
  return pCount >= 2 ? null : 2 - pCount;
}

/**
 * Score a full set of ratings.
 *
 * @param {object} data           ASSESSMENT_DATA
 * @param {object} ratings        assessment id -> 'P' | 'D' | 'S' | null
 * @param {object} examRatings    { exam1, exam2, exam3 } -> 'A' | 'B' | 'T' | null
 * @param {object} [options]
 * @param {string[]} [options.secondLowestGoals]   goal keys using second-lowest
 * @param {boolean}  [options.includeSpecialTopics]
 * @param {string}   [options.specialTopics]       'P' | 'D' | 'S' | null
 */
function calculateGrades(data, ratings, examRatings, options = {}) {
  const secondLowestGoals = options.secondLowestGoals || SECOND_LOWEST_GOALS;
  const ratingOf = (id) => (isValidRating(ratings[id]) ? ratings[id] : null);
  const gradedOnly = (ids) => ids.map(ratingOf).filter((r) => r !== null);

  const goals = {};
  let lgPoints = 0;

  for (const [goalKey, goal] of Object.entries(data.learningGoals)) {
    const goalUsesSecondLowest = secondLowestGoals.includes(goalKey);
    const subgoals = {};
    for (const [subgoalId, subgoal] of Object.entries(goal.subgoals || {})) {
      const graded = gradedOnly(subgoal.assessments);
      const useSecondLowest = goalUsesSecondLowest;
      subgoals[subgoalId] = Object.assign(subgoalRating(graded, useSecondLowest), {
        id: subgoalId,
        name: subgoal.name,
        total: subgoal.assessments.length,
        useSecondLowest,
        liftsToP: liftsNeeded(graded, useSecondLowest),
      });
    }

    const globalIds = goal.global_assessments || [];
    const globalGraded = gradedOnly(globalIds);
    const global = Object.assign(globalRating(globalGraded), {
      ids: globalIds,
      total: globalIds.length,
      liftsToP: globalGraded.filter((r) => r !== 'P').length || null,
    });

    const rating = goalRating(Object.values(subgoals).map((s) => s.rating), global.rating);

    /**
     * A goal with nothing graded anywhere still scores P, because the rules
     * say an ungraded subgoal counts as P. Those are points you have not
     * earned yet, so flag them rather than passing them off as banked.
     */
    const gradedHere = Object.values(subgoals).reduce((n, s) => n + s.graded, 0) + global.graded;

    goals[goalKey] = {
      key: goalKey,
      name: goal.name,
      rating,
      subgoals,
      global,
      graded: gradedHere,
      provisional: gradedHere === 0,
      points: RATING_POINTS[rating],
    };
    lgPoints += RATING_POINTS[rating];
  }

  const exams = {};
  let examPoints = 0;
  for (const key of ['exam1', 'exam2', 'exam3']) {
    const rating = isValidExamRating(examRatings[key]) ? examRatings[key] : null;
    const points = rating ? EXAM_POINTS[rating] : 0;
    exams[key] = { key, rating, points };
    examPoints += points;
  }

  // Syllabus 6: Special Topics adds up to 2 points on top of the 30, so a
  // total above 30 is possible. A+ is "30 or more", not "exactly 30".
  const includeSpecial = options.includeSpecialTopics !== false;
  const specialRating = isValidRating(options.specialTopics) ? options.specialTopics : null;
  const specialTopicsPoints = includeSpecial && specialRating ? RATING_POINTS[specialRating] : 0;

  const totalPoints = lgPoints + examPoints + specialTopicsPoints;
  const verdict = gradeFromPoints(totalPoints, goals['0'].rating);

  const goalList = Object.values(goals);
  /** Points currently resting on the ungraded-counts-as-P default. */
  const provisionalPoints = goalList
    .filter((g) => g.provisional)
    .reduce((n, g) => n + g.points, 0);
  const anythingGraded = goalList.some((g) => g.graded > 0)
    || Object.values(exams).some((e) => e.rating !== null);

  return {
    goals,
    exams,
    lgPoints,
    examPoints,
    specialTopics: { rating: specialRating, points: specialTopicsPoints, included: includeSpecial },
    specialTopicsPoints,
    totalPoints,
    maxPoints: 30 + (includeSpecial ? SPECIAL_TOPICS_MAX : 0),
    passes: totalPoints >= PASS_FLOOR_POINTS,
    provisionalPoints,
    provisionalGoals: goalList.filter((g) => g.provisional).length,
    anythingGraded,
    letterGrade: verdict.grade,
    uncappedGrade: verdict.uncappedGrade,
    gatedByLG0: verdict.gated,
    lg0Rating: goals['0'].rating,
    segments: buildSegments(goals, exams, includeSpecial ? specialTopicsPoints : null, specialRating),
    nextRung: nextRung(totalPoints, goals['0'].rating),
  };
}

/**
 * The 30-point bar, in order: LG0..LG8 (2 slots each) then Exam 1..3 (4 each).
 * Each segment reports how many of its slots are filled.
 */
function buildSegments(goals, exams, specialPoints, specialRating) {
  const segments = [];
  for (let i = 0; i <= 8; i++) {
    const goal = goals[String(i)];
    segments.push({
      kind: 'goal',
      key: goal.key,
      label: `LG ${i}`,
      name: goal.name,
      capacity: 2,
      filled: goal.points,
      rating: goal.rating,
      provisional: goal.provisional,
    });
  }
  ['exam1', 'exam2', 'exam3'].forEach((key, idx) => {
    const exam = exams[key];
    segments.push({
      kind: 'exam',
      key,
      label: `Exam ${idx + 1}`,
      name: `Exam ${idx + 1}`,
      capacity: 4,
      filled: exam.points,
      rating: exam.rating,
    });
  });
  if (specialPoints !== null) {
    segments.push({
      kind: 'bonus',
      key: 'special',
      label: 'Special Topics',
      name: 'Special Topics',
      capacity: SPECIAL_TOPICS_MAX,
      filled: specialPoints,
      rating: specialRating,
    });
  }
  return segments;
}

/** The next letter up and what it costs, accounting for the LG0 gate. */
function nextRung(totalPoints, lg0Rating) {
  const ascending = [...GRADE_LADDER].reverse();
  const next = ascending.find((r) => r.points > totalPoints);
  if (!next) return null;
  return {
    grade: next.grade,
    points: next.points,
    pointsNeeded: next.points - totalPoints,
    blockedByLG0: GATED_GRADES.includes(next.grade) && lg0Rating !== 'P',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateGrades,
    gradeFromPoints,
    subgoalRating,
    globalRating,
    goalRating,
    liftsNeeded,
    zyBooksScoreToRating,
    isValidRating,
    isValidExamRating,
    RATING_POINTS,
    EXAM_POINTS,
    GRADE_LADDER,
    SECOND_LOWEST_GOALS,
    SPECIAL_TOPICS_MAX,
    PASS_FLOOR_POINTS,
  };
}
