/**
 * Completes the assessment structure so it matches the Fall 2026 syllabus.
 *
 * `js/data.js` holds the assessment list and subgoal membership as the course
 * publishes it. Learning Goal 0 is the one place that list is incomplete: the
 * syllabus gives LG 0 four subgoals and the published data names only two, so
 * nine assessments tagged 0.1 or 0.2 belong to no subgoal and score nothing
 * until they are put back.
 *
 * The rules this module and the engine implement, with their sections:
 *
 *   syllabus 2   LG 0 has four subgoals -- 0.1 Baseline and Tools,
 *                0.2 Commitment and Quality Feedback, 0.3 Technical
 *                Communication, and 0.4 Collaboration.
 *
 *   syllabus 5.2 Subgoals of LG 0 take the second-LOWEST assessment rating;
 *                subgoals of every other goal take the second-highest.
 *
 *   syllabus 6   Up to 2 additional points are available for demonstrating
 *                proficiency with extra material, added to the total.
 *
 *   syllabus 5.3 The top exam rating is "Application".
 */

/** Names come from syllabus section 2; membership from each assessment's tag. */
const LG0_MISSING_SUBGOALS = {
  '0.1': 'Baseline and Tools',
  '0.2': 'Commitment and Quality Feedback',
};

// The scoring constants themselves (SECOND_LOWEST_GOALS, SPECIAL_TOPICS_MAX,
// PASS_FLOOR_POINTS) live in engine.js. Both files load as classic scripts into
// one global scope, so declaring them twice would be a redeclaration error.

/**
 * Rebuild the learning goals with LG 0's missing subgoals restored.
 *
 * Membership is taken from each assessment's own `subgoals` tag rather than
 * invented: assessments tagged "0.1" become subgoal 0.1 and so on. Assessments
 * already inside a subgoal are left where they are, because a handful of them
 * carry a stale `lgLabel` of "LG 0.1" while sitting correctly in 0.3.
 */
function applySyllabus(data) {
  const placed = new Set();
  Object.values(data.learningGoals).forEach((goal) => {
    Object.values(goal.subgoals || {}).forEach((sg) => sg.assessments.forEach((id) => placed.add(id)));
    (goal.global_assessments || []).forEach((id) => placed.add(id));
  });

  const rebuilt = {};
  for (const [goalKey, goal] of Object.entries(data.learningGoals)) {
    rebuilt[goalKey] = {
      name: goal.name,
      subgoals: Object.assign({}, goal.subgoals),
      global_assessments: (goal.global_assessments || []).slice(),
    };
  }

  for (const [subgoalId, name] of Object.entries(LG0_MISSING_SUBGOALS)) {
    if (rebuilt['0'].subgoals[subgoalId]) continue;
    const assessments = data.assessments
      .filter((a) => !placed.has(a.id) && (a.subgoals || []).includes(subgoalId))
      .map((a) => a.id);
    if (assessments.length) rebuilt['0'].subgoals[subgoalId] = { name, assessments };
  }

  // Keep subgoal ids in order so LG 0 reads 0.1, 0.2, 0.3, 0.4.
  const ordered = {};
  Object.keys(rebuilt['0'].subgoals).sort().forEach((id) => {
    ordered[id] = rebuilt['0'].subgoals[id];
  });
  rebuilt['0'].subgoals = ordered;

  return { learningGoals: rebuilt, assessments: data.assessments };
}

/** Assessments that make up the Special Topics opportunity (syllabus 6). */
function specialTopicsAssessments(data) {
  return data.assessments.filter((a) => /special topics/i.test(a.name));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applySyllabus,
    specialTopicsAssessments,
    LG0_MISSING_SUBGOALS,
  };
}
