/**
 * Works out whether raising a given assessment can still change anything.
 *
 * Two things make that non-obvious in this course:
 *
 *   1. An assessment can count in more than one subgoal. Nine of them are
 *      named for it -- "MCQs: Analysis (LG 2.1, 2.2)" feeds both.
 *
 *   2. The same piece of work is often graded twice under different ids, on
 *      different axes, landing in different goals. A program writeup is marked
 *      for its content in its own LG and again for typesetting in LG 0.3; a
 *      studio session is marked for content in its LG and again for
 *      participation in LG 0.4.
 *
 * Because a subgoal is capped at P, an assessment whose subgoals are all
 * already at P cannot improve the grade however well it is done. Knowing that
 * -- and knowing when the *other* half of the same work still matters -- is
 * the difference between useful effort and wasted effort.
 *
 * "Can this still matter?" is answered by simulation rather than by reading
 * the current rating, because the two aggregation rules behave in opposite
 * directions. A second-highest subgoal is raised by a good grade; a
 * second-lowest one (all of LG 0) can never be raised by an extra grade at
 * all, only held or pulled down. Scoring the subgoal twice over -- once with
 * this assessment at P, once at S -- answers both questions exactly, for
 * either rule, with no special cases.
 */

/**
 * The engine's aggregation, however this file was loaded. In the browser
 * engine.js is a plain script loaded first, so its functions are already in
 * scope; under Node each test requires it directly.
 */
const RULES = (typeof module !== 'undefined' && module.exports)
  ? require('./engine.js')
  : {
    subgoalRating: subgoalRating,
    globalRating: globalRating,
    RATING_POINTS: RATING_POINTS,
    SECOND_LOWEST_GOALS: SECOND_LOWEST_GOALS,
  };

/** Qualifiers that mark which axis a piece of work is being graded on. */
const AXIS_WORDS = /\b(typesetting|participation)\b/g;

/**
 * Which axis a row grades, if it is one of the professional-skills ones.
 *
 * A writeup marked for typesetting and a studio marked for participation are
 * the same work seen from LG 0's side. Naming that axis is what lets the UI
 * say "you still owe this for typesetting" instead of "no gain".
 */
function axisOf(name) {
  const hit = String(name).match(/\b(typesetting|participation)\b/i);
  return hit ? hit[1].toLowerCase() : null;
}

/** Base names this generic are not evidence of anything on their own. */
const MAX_LOOSE_GROUP = 4;

function baseWorkName(name, looseNameFn) {
  return looseNameFn(name).replace(AXIS_WORDS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Which piece of work an assessment belongs to.
 *
 * Studios are keyed by week, because the participation entry and the content
 * entry carry different LG tags for the same session. Everything else is keyed
 * by base name plus its LG tags, which pairs a writeup with its typesetting
 * twin exactly.
 */
function workKey(name, looseNameFn, parseLgTagsFn) {
  const week = String(name).match(/week\s+(\d+)\s+studio/i);
  if (week) return 'studio:' + week[1];
  return 'work:' + baseWorkName(name, looseNameFn) + ':'
    + parseLgTagsFn(name).slice().sort().join('+');
}

/**
 * Index every assessment's places and partners.
 *
 * @param {object} data           syllabus-reconciled ASSESSMENT_DATA
 * @param {object} nameHelpers    { looseName, parseLgTags } from ingest.js
 */
function buildRelations(data, nameHelpers) {
  const looseNameFn = nameHelpers.looseName;
  const parseLgTagsFn = nameHelpers.parseLgTags;

  const places = {};
  const add = (id, place) => { (places[id] = places[id] || []).push(place); };

  for (const [goalKey, goal] of Object.entries(data.learningGoals)) {
    const secondLowest = RULES.SECOND_LOWEST_GOALS.indexOf(goalKey) >= 0;
    for (const [subgoalId, subgoal] of Object.entries(goal.subgoals || {})) {
      subgoal.assessments.forEach((id) => add(id, {
        kind: 'subgoal', goalKey, subgoalId, label: subgoalId, name: subgoal.name,
        // Everything needed to rescore this subgoal under a what-if.
        ids: subgoal.assessments, secondLowest,
      }));
    }
    (goal.global_assessments || []).forEach((id) => add(id, {
      kind: 'global', goalKey, subgoalId: null, label: 'LG ' + goalKey + ' global', name: 'Global assessments',
      ids: goal.global_assessments, secondLowest,
    }));
  }

  // Group by piece of work, precisely (name + LG tags) and loosely (name only).
  const byWork = new Map();
  const byBase = new Map();
  data.assessments.forEach((a) => {
    const wk = workKey(a.name, looseNameFn, parseLgTagsFn);
    if (!byWork.has(wk)) byWork.set(wk, []);
    byWork.get(wk).push(a);

    const base = baseWorkName(a.name, looseNameFn);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(a);
  });

  /**
   * Partners are the same work graded elsewhere. The precise key is tried
   * first; only if it finds nothing does the looser name-only key apply, and
   * then only for small groups -- "knowledge check" names thirteen unrelated
   * assessments and must not link them all.
   */
  const partners = {};
  data.assessments.forEach((a) => {
    const wk = workKey(a.name, looseNameFn, parseLgTagsFn);
    let group = (byWork.get(wk) || []).filter((o) => o.id !== a.id);

    if (!group.length) {
      const base = baseWorkName(a.name, looseNameFn);
      const loose = byBase.get(base) || [];
      if (loose.length <= MAX_LOOSE_GROUP) group = loose.filter((o) => o.id !== a.id);
    }

    // Only a partner if it is scored somewhere this assessment is not.
    const mine = new Set((places[a.id] || []).map((p) => p.label));
    partners[a.id] = group
      .filter((o) => (places[o.id] || []).some((p) => !mine.has(p.label)))
      .map((o) => o.id);
  });

  return { places, partners };
}

/**
 * What an assessment can still do for the grade, given the current ratings.
 *
 * @param {number} id
 * @param {object} relations  from buildRelations
 * @param {object} results    from calculateGrades
 * @param {object} byId       assessment id -> assessment
 * @param {object} ratings    assessment id -> current rating
 */
function assessmentLeverage(id, relations, results, byId, ratings) {
  const ratingOf = (place) => {
    const goal = results.goals[place.goalKey];
    if (!goal) return null;
    if (place.kind === 'global') return goal.global.rating;
    const sub = goal.subgoals[place.subgoalId];
    return sub ? sub.rating : null;
  };

  /**
   * Rescore one place with a single assessment forced to `whatIf`.
   *
   * Ungraded assessments are left out, exactly as the engine leaves them out,
   * so "nothing graded yet" stays distinguishable from "everything graded S".
   */
  const rescore = (place, targetId, whatIf) => {
    const list = (place.ids || [])
      .map((each) => (each === targetId ? whatIf : ratings[each]))
      .filter((r) => r === 'P' || r === 'D' || r === 'S');
    return place.kind === 'global'
      ? RULES.globalRating(list).rating
      : RULES.subgoalRating(list, place.secondLowest).rating;
  };

  const points = (rating) => (rating in RULES.RATING_POINTS ? RULES.RATING_POINTS[rating] : -1);

  /**
   * What this assessment can still do to one place it counts in.
   *
   * The two rules need different questions asked of them.
   *
   * Second-highest: headroom is the question. A subgoal below P can still be
   * lifted, and this assessment is one of the grades that would lift it --
   * not necessarily on its own, since two good grades are needed to move a
   * second-highest, but it counts towards them. Asking "does a P here raise
   * it *this instant*" would call the first of the two pointless.
   *
   * Second-lowest: headroom is the wrong question, because there is none.
   * Adding a grade to a second-lowest set can never raise it, only hold or
   * lower it, so a simulation is the only honest answer. `canDrop` then
   * carries the weight: an S here would cost something, which is precisely
   * why the work still has to be done.
   */
  const inspect = (place, targetId) => {
    const rating = ratingOf(place);
    const now = rescore(place, null, null);
    const raises = points(rescore(place, targetId, 'P')) > points(now);
    return {
      label: place.label,
      goalKey: place.goalKey,
      rating,
      atP: rating === 'P',
      canRaise: place.secondLowest ? raises : rating !== 'P',
      canDrop: points(rescore(place, targetId, 'S')) < points(now),
    };
  };

  const graded = (target) => ratings[target] === 'P' || ratings[target] === 'D'
    || ratings[target] === 'S';

  /** One row's standing: can it still win anything, or still lose anything? */
  const standing = (target, targetPlaces) => {
    if (!targetPlaces.length) return 'uncounted';
    if (ratings[target] === 'P') return 'at-p';
    if (targetPlaces.some((p) => p.canRaise)) return 'can-help';
    // Not yet marked, and the mark it eventually gets could cost something.
    if (!graded(target) && targetPlaces.some((p) => p.canDrop)) return 'pending';
    return 'no-gain';
  };

  const places = (relations.places[id] || []).map((place) => inspect(place, id));

  const partners = (relations.partners[id] || []).map((partnerId) => {
    const partnerPlaces = (relations.places[partnerId] || [])
      .map((place) => inspect(place, partnerId));
    const partnerName = byId[partnerId] ? byId[partnerId].name : String(partnerId);
    const partnerStatus = standing(partnerId, partnerPlaces);
    return {
      id: partnerId,
      name: partnerName,
      rating: ratings[partnerId] || null,
      places: partnerPlaces,
      status: partnerStatus,
      /** The work is still worth doing for this partner's sake. */
      canHelp: partnerStatus === 'can-help' || partnerStatus === 'pending',
      /** "typesetting" / "participation", when this row grades that axis. */
      axis: axisOf(partnerName),
      /** True when every place it counts is inside LG 0. */
      inLg0: partnerPlaces.length > 0 && partnerPlaces.every((p) => p.goalKey === '0'),
    };
  });

  const status = standing(id, places);

  /**
   * When this row is finished with but the work is not, is everything still
   * riding on it an LG 0 axis grade?
   *
   * This is the writeup whose content subgoal is full but whose typesetting
   * mark in LG 0.3 is still to come, and the studio whose content is full but
   * whose participation mark is still to come. Calling that "no gain" is
   * wrong -- the work still has to be done and handed in to earn the LG 0
   * grade. Naming the axis says so in one word.
   *
   * Once that LG 0 subgoal is itself settled at P nothing is owed: a
   * second-lowest subgoal cannot be raised by a further grade, so there
   * genuinely is no gain left, on either axis.
   */
  const helping = partners.filter((p) => p.canHelp);
  const axisOnly = status === 'no-gain'
    && helping.length > 0
    && helping.every((p) => p.axis && p.inLg0);

  const axes = [];
  if (axisOnly) {
    helping.forEach((p) => { if (axes.indexOf(p.axis) < 0) axes.push(p.axis); });
  }

  return {
    places,
    partners,
    countsInSeveral: places.length > 1,
    status,
    /** Marking this higher would score one of its subgoals higher. */
    canHelp: status === 'can-help',
    /** Not marked yet, and the mark it gets can still cost points. */
    pending: status === 'pending',
    /** The work still matters somewhere, even if this particular row does not. */
    workCanHelp: status === 'can-help' || status === 'pending'
      || partners.some((p) => p.canHelp),
    /** The axes still owed, e.g. "typesetting", when only those are left. */
    axesLeft: axes,
    /** Partners the work is still owed to, for the explanation. */
    stillOwedTo: helping,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildRelations, assessmentLeverage, workKey, baseWorkName, axisOf };
}
