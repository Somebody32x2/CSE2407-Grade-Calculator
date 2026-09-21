/**
 * UI for the CSE 2407 grade calculator.
 *
 * State lives in one object and is written to localStorage on every change.
 * Every edit re-scores from scratch and repaints; there is no incremental
 * update path to get out of step with the engine.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'cse2407.progress';
  var THEME_KEY = 'cse2407.theme';
  var TOKEN_KEY = 'cse2407.syncToken';
  var SYNC_POLL_MS = 5000;
  var FILE_VERSION = 2;
  var EXAM_KEYS = ['exam1', 'exam2', 'exam3'];

  /* ------------------------------------------------------------- state --- */

  var state = {
    ratings: {},        // assessment id -> 'P' | 'D' | 'S'
    zyScores: {},       // assessment id -> string entered in the 0-10 box
    exams: { exam1: null, exam2: null, exam3: null },
    specialTopics: null, // syllabus 6: the up-to-2-point bonus component
    open: {},           // goal key -> expanded?
    /**
     * Where each rating came from: target -> { source, at, strength }. Canvas
     * and Gradescope cover different ground and mark at different times, so a
     * scrape is merged against this rather than written over the top.
     */
    provenance: {},
    officialGoals: {},  // goal key -> the rating Canvas says the instructors gave
    syncs: {},          // source name -> { at, matched, rows, skipped, unmatched }
  };

  var results = null;
  var filterText = '';
  var hideSpent = false; // hide rows that can no longer change the grade

  /* --------------------------------------------------- derived structure -- */

  /**
   * The full structure, with LG 0's subgoals 0.1 and 0.2 restored from the
   * syllabus. Everything downstream scores against this.
   */
  var DATA = applySyllabus(ASSESSMENT_DATA);

  var byId = {};
  DATA.assessments.forEach(function (a) { byId[a.id] = a; });

  var SPECIAL_TOPICS = specialTopicsAssessments(DATA);

  /**
   * Where each assessment counts, and which other assessment is the same
   * piece of work graded on another axis. Static, so built once.
   */
  var RELATIONS = buildRelations(DATA, {
    looseName: looseName,
    parseLgTags: parseLgTags,
  });

  /** Assessment ids that a subgoal or global list actually references. */
  var countedIds = (function () {
    var set = new Set();
    Object.values(DATA.learningGoals).forEach(function (goal) {
      Object.values(goal.subgoals || {}).forEach(function (sg) {
        sg.assessments.forEach(function (id) { set.add(id); });
      });
      (goal.global_assessments || []).forEach(function (id) { set.add(id); });
    });
    return set;
  })();

  /**
   * Assessments belonging to no subgoal. After reconciliation this is just the
   * two Special Topics rows, which the syllabus treats as a separate bonus
   * component rather than part of a learning goal.
   */
  function uncountedList() {
    return DATA.assessments.filter(function (a) {
      return !countedIds.has(a.id) && SPECIAL_TOPICS.indexOf(a) < 0;
    });
  }

  /** Assessments that can actually move the grade. */
  function gradableIds() {
    return Array.from(countedIds);
  }

  var isZyBooks = function (a) { return /zybooks/i.test(a.name); };

  var GOAL_KEYS = Object.keys(DATA.learningGoals).sort(function (a, b) {
    return Number(a) - Number(b);
  });

  /* ------------------------------------------------------------- helpers -- */

  function $(sel) { return document.querySelector(sel); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function chipClass(rating) {
    if (rating === 'P' || rating === 'A') return 'chip chip--p';
    if (rating === 'D' || rating === 'B') return 'chip chip--d';
    if (rating === 'S' || rating === 'T') return 'chip chip--s';
    return 'chip chip--none';
  }

  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }

  var toastTimer = null;
  function toast(message) {
    var node = $('#toast');
    node.textContent = message;
    node.classList.add('toast--on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('toast--on'); }, 2600);
  }

  /* ------------------------------------------------------------ storage -- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: FILE_VERSION,
        savedAt: new Date().toISOString(),
        ratings: state.ratings,
        zyScores: state.zyScores,
        exams: state.exams,
        specialTopics: state.specialTopics,
        provenance: state.provenance,
        officialGoals: state.officialGoals,
        syncs: state.syncs,
      }));
    } catch (err) {
      $('#save-state').textContent = 'Not saved: this browser is blocking storage';
    }
  }

  function restore() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (err) { return; }
    if (!raw) return;
    try { adopt(JSON.parse(raw)); } catch (err) { /* corrupt entry, start fresh */ }
  }

  /**
   * Take ratings from a parsed save file, discarding anything that is not a
   * rating this app understands. A hand-edited or stale file can no longer
   * push junk into the arithmetic.
   */
  function adopt(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('not an object');

    var ratings = {};
    var source = payload.ratings || payload.studentRatings || {};
    Object.keys(source).forEach(function (key) {
      var id = Number(key);
      if (byId[id] && isValidRating(source[key])) ratings[id] = source[key];
    });

    var zy = {};
    Object.keys(payload.zyScores || {}).forEach(function (key) {
      var id = Number(key);
      var n = Number(payload.zyScores[key]);
      if (byId[id] && !Number.isNaN(n) && n >= 0 && n <= 10) zy[id] = String(payload.zyScores[key]);
    });

    var exams = { exam1: null, exam2: null, exam3: null };
    var examSource = payload.exams || payload.examRatings || {};
    EXAM_KEYS.forEach(function (key) {
      if (isValidExamRating(examSource[key])) exams[key] = examSource[key];
    });

    state.ratings = ratings;
    state.zyScores = zy;
    state.exams = exams;
    if (isValidRating(payload.specialTopics)) state.specialTopics = payload.specialTopics;
    if (payload.provenance && typeof payload.provenance === 'object') {
      state.provenance = payload.provenance;
    }
    if (payload.officialGoals && typeof payload.officialGoals === 'object') {
      state.officialGoals = payload.officialGoals;
    }
    if (payload.syncs && typeof payload.syncs === 'object') state.syncs = payload.syncs;
  }

  function countDropped(payload) {
    var source = payload.ratings || payload.studentRatings || {};
    return Object.keys(source).filter(function (key) {
      return !(byId[Number(key)] && isValidRating(source[key]));
    }).length;
  }

  /* --------------------------------------------------------------- theme -- */

  var THEME_ORDER = ['auto', 'light', 'dark'];
  var THEME_FACE = { auto: ['◐', 'Match system'], light: ['☀', 'Light'], dark: ['☽', 'Dark'] };

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    var btn = $('#theme-btn');
    btn.querySelector('.icon-btn__glyph').textContent = THEME_FACE[theme][0];
    btn.querySelector('.icon-btn__text').textContent = THEME_FACE[theme][1];
    btn.setAttribute('aria-label', 'Colour theme: ' + THEME_FACE[theme][1] + '. Activate to change.');
    try { localStorage.setItem(THEME_KEY, theme); } catch (err) { /* ignore */ }
  }

  function cycleTheme() {
    var current = document.documentElement.dataset.theme || 'auto';
    applyTheme(THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length]);
  }

  /* --------------------------------------------------------------- score -- */

  /**
   * Start every assessment at S.
   *
   * The grade then only ever moves upward as real grades land, which is a
   * simpler story than a projection that drifts down from a provisional 18.
   * Exams stay blank because their lowest rating, T, is still worth a point:
   * "not sat yet" has to mean zero.
   */
  function seedRatings() {
    DATA.assessments.forEach(function (a) {
      if (!isValidRating(state.ratings[a.id])) state.ratings[a.id] = 'S';
    });
    if (!isValidRating(state.specialTopics)) state.specialTopics = 'S';
  }

  function score() {
    results = calculateGrades(DATA, state.ratings, state.exams, {
      secondLowestGoals: SECOND_LOWEST_GOALS,
      includeSpecialTopics: true,
      specialTopics: state.specialTopics,
    });
  }

  function gradedCount() {
    return gradableIds().filter(function (id) {
      return isValidRating(state.ratings[id]);
    }).length;
  }

  /* ------------------------------------------------------ render: ladder -- */

  /** Letter thresholds keyed by the point total that first earns them. */
  var RUNG_AT = (function () {
    var map = {};
    GRADE_LADDER.forEach(function (rung) { map[rung.points] = rung.grade; });
    return map;
  })();

  var GATED_AT = { 28: true, 29: true, 30: true };

  function renderLadder() {
    var host = $('#ladder');
    host.textContent = '';

    var locked = results.lg0Rating !== 'P';
    var slot = 0;

    results.segments.forEach(function (segment, segIndex) {
      var fillVar = segment.kind === 'exam' ? 'var(--accent)'
        : segment.kind === 'bonus' ? 'var(--bonus)'
        : ({ P: 'var(--p)', D: 'var(--d)', S: 'var(--s)' }[segment.rating] || 'var(--slot-open)');

      for (var i = 0; i < segment.capacity; i++) {
        slot++;
        var point = slot;

        // Each segment fills its OWN slots. A goal that earned nothing shows
        // two empty cells rather than borrowing fill from later in the bar, so
        // the gaps mark exactly where points were lost.
        var filled = i < segment.filled;

        var node = el('div', 'slot');
        if (i === 0 && segIndex > 0) node.classList.add('slot--seg-start');
        if (point === 1) node.classList.add('slot--first');
        if (point === 30) node.classList.add('slot--last');
        if (segment.kind === 'bonus') node.classList.add('slot--bonus');
        if (filled) node.classList.add('slot--filled');

        // The ruler underneath measures point totals, which is a different
        // thing from where the points came from: the letter thresholds and the
        // LG 0 lock belong to it, not to the cells above.
        if (RUNG_AT[point]) node.classList.add('slot--rung');
        if (point === 20 || point === 30) node.classList.add('slot--rung-major');
        if (point === results.totalPoints && results.totalPoints > 0) node.classList.add('slot--here');
        if (locked && GATED_AT[point]) node.classList.add('slot--locked');

        var cell = el('div', 'slot__cell');
        if (filled) cell.style.setProperty('--fill', fillVar);
        cell.title = segment.label + ': ' + segment.filled + ' of ' + segment.capacity + ' points'
          + (RUNG_AT[point] ? ' · ' + RUNG_AT[point] + ' starts at ' + point : '');
        node.appendChild(cell);

        var tick = el('div', 'slot__tick', RUNG_AT[point] || '');
        if (locked && GATED_AT[point]) tick.title = RUNG_AT[point] + ' needs LG 0 = P';
        node.appendChild(tick);

        host.appendChild(node);
      }
    });

    $('#ladder-alt').textContent = describeLadder();
  }

  function describeLadder() {
    var parts = results.segments.map(function (s) {
      return s.label + ' ' + s.filled + ' of ' + s.capacity;
    });
    return 'Points earned by source: ' + parts.join(', ')
      + '. Total ' + results.totalPoints + ' of ' + results.maxPoints
      + ', grade ' + results.letterGrade + '.';
  }

  function renderLadderLegend() {
    var host = $('#ladder-legend');
    host.textContent = '';
    GRADE_LADDER.slice().reverse().forEach(function (rung) {
      var node = el('span', '', rung.grade + ' · ' + rung.points);
      if (rung.grade === results.letterGrade) node.className = 'is-current';
      host.appendChild(node);
    });
  }

  function renderBreakdown() {
    var body = $('#breakdown-body');
    body.textContent = '';
    results.segments.forEach(function (segment) {
      var tr = el('tr');
      var th = el('th', '', segment.label + (segment.kind === 'goal' ? ' · ' + segment.name : ''));
      th.scope = 'row';
      tr.appendChild(th);
      var rating = el('td');
      var chip = el('b', chipClass(segment.rating), segment.rating || '–');
      rating.appendChild(chip);
      tr.appendChild(rating);
      tr.appendChild(el('td', '', String(segment.filled)));
      tr.appendChild(el('td', '', String(segment.capacity)));
      body.appendChild(tr);
    });
    $('#breakdown-total').textContent = String(results.totalPoints);
    $('#breakdown-max').textContent = String(results.maxPoints);
  }

  /* ----------------------------------------------------- render: summary -- */

  function renderSummary() {
    $('#grade-letter').textContent = results.letterGrade;
    $('#total-points').textContent = String(results.totalPoints);
    $('#max-points').textContent = String(results.maxPoints);
    $('#lg-points').textContent = String(results.lgPoints);
    $('#exam-points').textContent = String(results.examPoints);
    $('#graded-count').textContent = String(gradedCount());
    $('#gradable-count').textContent = String(gradableIds().length);

    var gate = $('#gate-state');
    if (results.lg0Rating === 'P') {
      gate.textContent = 'Open · A range available';
      gate.className = 'gate gate--open';
    } else {
      gate.textContent = 'Closed · LG 0 is ' + results.lg0Rating + ', so B+ is the ceiling';
      gate.className = 'gate gate--closed';
    }

    var next = $('#next-rung');
    next.textContent = '';
    if (results.gatedByLG0) {
      next.append(
        'You have ' + results.totalPoints + ' points, enough for ',
        Object.assign(el('b'), { textContent: results.uncappedGrade }),
        ', but LG 0 is ' + results.lg0Rating + ' so the grade is held at ',
        Object.assign(el('b'), { textContent: results.letterGrade }),
        '. Lift LG 0 to P to release it.',
      );
      return;
    }
    if (!results.nextRung) {
      next.textContent = 'Full marks. There is nothing above ' + results.maxPoints + ' points.';
      return;
    }
    var rung = results.nextRung;
    next.append(
      Object.assign(el('b'), { textContent: rung.pointsNeeded + ' more ' + plural(rung.pointsNeeded, 'point') }),
      ' reaches ',
      Object.assign(el('b'), { textContent: rung.grade }),
      rung.blockedByLG0 ? ' — and LG 0 has to be P as well.' : '.',
    );
  }

  /* ---------------------------------------------------- render: blockers -- */

  function renderBlockers() {
    var host = $('#blockers-list');
    host.textContent = '';
    var items = [];

    GOAL_KEYS.forEach(function (key) {
      var goal = results.goals[key];
      if (goal.rating === 'P') return;

      Object.values(goal.subgoals).forEach(function (sg) {
        if (sg.rating === 'P') return;
        items.push({
          where: 'LG ' + key + '.' + sg.id.split('.')[1],
          what: sg.name + ' sits at ' + sg.rating + '.',
          detail: sg.graded === 0
            ? 'No grades recorded.'
            : (sg.liftsToP
              ? 'Raise ' + sg.liftsToP + ' more ' + plural(sg.liftsToP, 'grade') + ' to P.'
              : 'Already clear.'),
          goalKey: key,
          weight: sg.rating === 'S' ? 0 : 1,
        });
      });

      if (goal.global.rating !== 'P' && goal.global.total > 0) {
        items.push({
          where: 'LG ' + key + ' global',
          what: 'Global assessments sit at ' + goal.global.rating + '.',
          detail: goal.global.liftsToP
            ? 'Raise ' + goal.global.liftsToP + ' more ' + plural(goal.global.liftsToP, 'grade') + ' to P.'
            : 'Already clear.',
          goalKey: key,
          weight: goal.global.rating === 'S' ? 0 : 1,
        });
      }
    });

    EXAM_KEYS.forEach(function (key, idx) {
      var exam = results.exams[key];
      if (exam.rating === 'A') return;
      items.push({
        where: 'Exam ' + (idx + 1),
        what: exam.rating ? 'Graded ' + exam.rating + ', worth ' + exam.points + '.'
          : 'Not graded, worth 0 so far.',
        detail: (4 - exam.points) + ' ' + plural(4 - exam.points, 'point') + ' still on the table.',
        goalKey: 'exams',
        weight: 2,
      });
    });

    if (items.length === 0) {
      var clear = el('li', 'blocker blocker--clear');
      clear.appendChild(el('span', 'blocker__where', 'Clear'));
      clear.appendChild(el('span', 'blocker__what', 'Every goal is at P and every exam is an A.'));
      host.appendChild(clear);
      return;
    }

    items.sort(function (a, b) { return a.weight - b.weight; });

    items.slice(0, 8).forEach(function (item) {
      var li = el('li', 'blocker');
      li.appendChild(el('span', 'blocker__where', item.where));
      var what = el('span', 'blocker__what');
      what.append(item.what + ' ', Object.assign(el('em'), { textContent: item.detail }));
      li.appendChild(what);
      var jump = el('button', 'blocker__jump', 'Open');
      jump.type = 'button';
      jump.addEventListener('click', function () {
        state.open[item.goalKey] = true;
        renderGoals();
        var target = document.getElementById('goal-' + item.goalKey);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.querySelector('.goal__summary').focus();
        }
      });
      li.appendChild(jump);
      host.appendChild(li);
    });
  }

  /* ------------------------------------------------------- render: goals -- */

  function matchesFilter(assessment) {
    return !filterText || assessment.name.toLowerCase().indexOf(filterText) !== -1;
  }

  function goalMatchesFilter(goalKey) {
    if (!filterText) return true;
    if (goalKey === 'exams') return 'exams'.indexOf(filterText) !== -1;
    var goal = DATA.learningGoals[goalKey];
    if (goal.name.toLowerCase().indexOf(filterText) !== -1) return true;
    var ids = [];
    Object.values(goal.subgoals || {}).forEach(function (sg) { ids = ids.concat(sg.assessments); });
    ids = ids.concat(goal.global_assessments || []);
    return ids.some(function (id) { return byId[id] && matchesFilter(byId[id]); });
  }

  function ratingControl(current, options, onPick) {
    var group = el('div', 'rating');
    group.setAttribute('role', 'group');
    options.forEach(function (option) {
      var btn = el('button', 'rating__btn', option.label);
      btn.type = 'button';
      btn.dataset.rating = option.value === null ? '' : option.value;
      btn.setAttribute('aria-pressed', String(current === option.value));
      btn.setAttribute('aria-label', option.title);
      btn.title = option.title;
      btn.addEventListener('click', function () { onPick(option.value); });
      group.appendChild(btn);
    });
    return group;
  }

  var PDS_OPTIONS = [
    { value: 'P', label: 'P', title: 'Proficient, 2 points' },
    { value: 'D', label: 'D', title: 'Developing, 1 point' },
    { value: 'S', label: 'S', title: 'Starting, 0 points' },
  ];

  var EXAM_OPTIONS = [
    { value: 'A', label: 'A', title: 'Advanced, 4 points' },
    { value: 'B', label: 'B', title: 'Baseline, 3 points' },
    { value: 'T', label: 'T', title: 'Attempted, 1 point' },
    { value: null, label: '–', title: 'Not graded yet' },
  ];

  /**
   * Flags explaining a row's reach and whether it is spent.
   *
   * A subgoal cannot go above P, so once every subgoal an assessment feeds is
   * at P, doing it better changes nothing. That is worth saying plainly --
   * but only after checking the same work is not still needed elsewhere,
   * which for studios and writeups it very often is.
   */
  function rowFlags(assessment) {
    var lv = assessmentLeverage(assessment.id, RELATIONS, results, byId, state.ratings);
    var flags = [];

    if (lv.countsInSeveral) {
      var labels = lv.places.map(function (p) { return p.label; }).join(' and ');
      var f = el('span', 'flag flag--multi', 'counts in ' + labels);
      f.title = 'One grade, counted in ' + lv.places.length + ' subgoals: '
        + lv.places.map(function (p) { return p.label + ' is ' + p.rating; }).join(', ');
      flags.push(f);
    }

    // One chip for all the other places this piece of work is graded, rather
    // than one per partner: the row is dense enough already.
    if (lv.partners.length) {
      var elsewhere = [];
      var detail = [];
      var anyOpen = false;
      lv.partners.forEach(function (partner) {
        partner.places.forEach(function (p) {
          if (elsewhere.indexOf(p.label) < 0) elsewhere.push(p.label);
        });
        if (partner.canHelp) anyOpen = true;
        detail.push('\u201c' + partner.name + '\u201d counts in '
          + partner.places.map(function (p) { return p.label + ', now ' + p.rating; }).join('; ')
          + (partner.canHelp ? ' \u2014 still worth doing' : ' \u2014 already maxed'));
      });
      if (elsewhere.length) {
        var pf = el('span', 'flag flag--also' + (anyOpen ? ' flag--also-open' : ''),
          'also ' + elsewhere.join(', '));
        pf.title = 'The same work is graded separately elsewhere. ' + detail.join('. ') + '.';
        flags.push(pf);
      }
    }

    if (lv.status === 'no-gain') {
      var note = el('span', 'flag flag--spent', 'no gain');
      note.title = lv.workCanHelp
        ? 'Every subgoal this counts in is already at P, so raising it here changes nothing '
          + '\u2014 but the same work still counts elsewhere, see the \u201calso\u201d flag.'
        : 'Every subgoal this counts in is already at P, so this can no longer change your grade.';
      flags.push(note);
    }

    return { flags: flags, leverage: lv };
  }

  function assessmentRow(assessment, opts) {
    var row = el('div', 'row');
    var rating = state.ratings[assessment.id] || null;
    if (rating) row.classList.add('row--rated');
    if (filterText && matchesFilter(assessment)) row.classList.add('row--match');

    var name = el('div', 'row__name');
    name.appendChild(document.createTextNode(assessment.name));
    var from = state.provenance[assessment.id];
    if (from && from.source) {
      var tag = el('span', 'row__from', from.source);
      tag.title = 'Imported from ' + from.source + ' ' + relativeTime(new Date(from.at).toISOString());
      name.appendChild(tag);
    }

    var marks = (opts && opts.uncounted) ? { flags: [], leverage: null } : rowFlags(assessment);
    marks.flags.forEach(function (f) { name.appendChild(f); });
    if (marks.leverage) {
      var spent = marks.leverage.status === 'no-gain' || marks.leverage.status === 'at-p';
      if (hideSpent && spent) row.hidden = true;
      if (marks.leverage.status === 'no-gain') row.classList.add('row--spent');
    }

    row.appendChild(name);

    if (isZyBooks(assessment) && !(opts && opts.uncounted)) {
      var wrap = el('div', 'rating-wrap');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '8px';

      var chip = el('b', chipClass(rating), rating || '–');
      var input = el('input', 'zy-input');
      input.type = 'number';
      input.min = '0';
      input.max = '10';
      input.step = '0.1';
      input.placeholder = '/10';
      input.value = state.zyScores[assessment.id] || '';
      input.setAttribute('aria-label', assessment.name + ', score out of 10');
      input.addEventListener('input', function () {
        var value = input.value;
        if (value === '') {
          delete state.zyScores[assessment.id];
          state.ratings[assessment.id] = 'S';
        } else {
          state.zyScores[assessment.id] = value;
          state.ratings[assessment.id] = zyBooksScoreToRating(value);
        }
        markSetByHand(assessment.id);
        commit();
      });

      wrap.appendChild(el('span', 'row__zy', '0–10'));
      wrap.appendChild(input);
      wrap.appendChild(chip);
      row.appendChild(wrap);
    } else {
      row.appendChild(ratingControl(rating, PDS_OPTIONS, function (value) {
        state.ratings[assessment.id] = value;
        markSetByHand(assessment.id);
        commit();
      }));
    }

    return row;
  }

  function subgoalBlock(goalKey, subgoalId, subgoal, scored) {
    var block = el('div', 'subgoal');

    var head = el('div', 'subgoal__head');
    head.appendChild(el('span', 'subgoal__code', subgoalId));
    head.appendChild(el('span', 'subgoal__name', subgoal.name));
    head.appendChild(Object.assign(el('b', chipClass(scored.rating), scored.rating), {}));
    if (scored.useSecondLowest) {
      head.appendChild(el('span', 'subgoal__flag', 'second-lowest'));
    }
    head.appendChild(el('span', 'subgoal__basis',
      scored.graded + ' of ' + scored.total + ' graded · ' + scored.basis));
    block.appendChild(head);

    var rows = el('div', 'rows');
    subgoal.assessments.forEach(function (id) {
      if (byId[id]) rows.appendChild(assessmentRow(byId[id]));
    });
    block.appendChild(rows);
    return block;
  }

  function globalBlock(goalKey, goal, scored) {
    var block = el('div', 'subgoal');
    var head = el('div', 'subgoal__head');
    head.appendChild(el('span', 'subgoal__code', 'global'));
    head.appendChild(el('span', 'subgoal__name', 'Global assessments'));
    head.appendChild(el('b', chipClass(scored.rating), scored.rating));
    head.appendChild(el('span', 'subgoal__basis',
      scored.graded + ' of ' + scored.total + ' graded · ' + scored.basis));
    block.appendChild(head);

    var rows = el('div', 'rows');
    scored.ids.forEach(function (id) {
      if (byId[id]) rows.appendChild(assessmentRow(byId[id]));
    });
    block.appendChild(rows);
    return block;
  }

  function uncountedBlock() {
    var list = uncountedList();
    var block = el('div', 'uncounted');
    block.appendChild(el('p', 'uncounted__note',
      'These ' + list.length + ' assessments belong to no subgoal, so nothing you enter for them '
      + 'can change the grade. They are listed so you can see they exist and are not being '
      + 'overlooked. If one of them should count, ask your instructors which subgoal it belongs '
      + 'to.'));
    var rows = el('div', 'rows');
    list.forEach(function (assessment) {
      var row = el('div', 'row');
      row.appendChild(el('div', 'row__name', assessment.name));
      row.appendChild(el('span', 'row__zy', assessment.lgLabel || 'untagged'));
      rows.appendChild(row);
    });
    block.appendChild(rows);
    if (!state.countZyLG0 && ZY_LG0_ID !== null) {
      block.appendChild(el('p', 'uncounted__flag',
        'One of these looks like an oversight rather than a choice: for LG 1 through LG 8 the '
        + 'global assessment is that goal’s zyBooks and nothing else, but LG 0 has an empty global '
        + 'list even though zyBooks LG 0 exists. Scoring options below let you count it.'));
    }
    return block;
  }

  function goalCard(goalKey) {
    var goal = DATA.learningGoals[goalKey];
    var scored = results.goals[goalKey];
    var open = !!state.open[goalKey];

    var card = el('div', 'goal' + (open ? ' goal--open' : ''));
    card.id = 'goal-' + goalKey;

    var summary = el('button', 'goal__summary');
    summary.type = 'button';
    summary.setAttribute('aria-expanded', String(open));
    summary.setAttribute('aria-controls', 'goal-body-' + goalKey);
    summary.appendChild(el('span', 'goal__caret'));
    summary.appendChild(el('span', 'goal__code', 'LG ' + goalKey));
    summary.appendChild(el('span', 'goal__name', goal.name));
    summary.appendChild(el('span', 'goal__progress', scored.points + ' / 2 pts'));
    summary.appendChild(el('b', chipClass(scored.rating), scored.rating));
    summary.addEventListener('click', function () {
      state.open[goalKey] = !state.open[goalKey];
      renderGoals();
    });
    card.appendChild(summary);

    var body = el('div', 'goal__body');
    body.id = 'goal-body-' + goalKey;
    body.hidden = !open;
    if (open) {
      Object.keys(scored.subgoals).forEach(function (subgoalId) {
        body.appendChild(subgoalBlock(goalKey, subgoalId, goal.subgoals[subgoalId], scored.subgoals[subgoalId]));
      });
      if (scored.global.ids.length) {
        body.appendChild(globalBlock(goalKey, goal, scored.global));
      }
      if (goalKey === '0' && uncountedList().length) {
        body.appendChild(uncountedBlock());
      }
    }
    card.appendChild(body);
    return card;
  }

  function examsCard() {
    var open = !!state.open.exams;
    var card = el('div', 'goal' + (open ? ' goal--open' : ''));
    card.id = 'goal-exams';

    var summary = el('button', 'goal__summary');
    summary.type = 'button';
    summary.setAttribute('aria-expanded', String(open));
    summary.setAttribute('aria-controls', 'goal-body-exams');
    summary.appendChild(el('span', 'goal__caret'));
    summary.appendChild(el('span', 'goal__code', 'Exams'));
    summary.appendChild(el('span', 'goal__name', 'Three exams, four points each'));
    summary.appendChild(el('span', 'goal__progress', results.examPoints + ' / 12 pts'));
    summary.appendChild(el('b', chipClass(null), results.examPoints + ''));
    summary.addEventListener('click', function () {
      state.open.exams = !state.open.exams;
      renderGoals();
    });
    card.appendChild(summary);

    var body = el('div', 'goal__body');
    body.id = 'goal-body-exams';
    body.hidden = !open;
    if (open) {
      var block = el('div', 'subgoal');
      var rows = el('div', 'rows');
      EXAM_KEYS.forEach(function (key, idx) {
        var row = el('div', 'row');
        if (state.exams[key]) row.classList.add('row--rated');
        row.appendChild(el('div', 'row__name', 'Exam ' + (idx + 1)));
        row.appendChild(ratingControl(state.exams[key], EXAM_OPTIONS, function (value) {
          state.exams[key] = value;
          markSetByHand(key);
          commit();
        }));
        rows.appendChild(row);
      });
      block.appendChild(rows);
      body.appendChild(block);
    }
    card.appendChild(body);
    return card;
  }

  /**
   * Syllabus 6: up to 2 points on top of the 30 for demonstrating proficiency
   * with additional material. It is scored as a single P/D/S rating, with the
   * assessments that make it up named underneath.
   */
  function specialTopicsCard() {
    var open = !!state.open.special;
    var card = el('div', 'goal' + (open ? ' goal--open' : ''));
    card.id = 'goal-special';

    var summary = el('button', 'goal__summary');
    summary.type = 'button';
    summary.setAttribute('aria-expanded', String(open));
    summary.setAttribute('aria-controls', 'goal-body-special');
    summary.appendChild(el('span', 'goal__caret'));
    summary.appendChild(el('span', 'goal__code', 'Bonus'));
    summary.appendChild(el('span', 'goal__name', 'Special Topics — up to 2 points on top of the 30'));
    summary.appendChild(el('span', 'goal__progress', results.specialTopicsPoints + ' / 2 pts'));
    summary.appendChild(el('b', chipClass(state.specialTopics), state.specialTopics));
    summary.addEventListener('click', function () {
      state.open.special = !state.open.special;
      renderGoals();
    });
    card.appendChild(summary);

    var body = el('div', 'goal__body');
    body.id = 'goal-body-special';
    body.hidden = !open;
    if (open) {
      var block = el('div', 'subgoal');
      block.appendChild(el('p', 'subgoal__note',
        'Rated P, D or S like any other work, but added to your total rather than to a learning '
        + 'goal, so a perfect record plus Special Topics comes to 32. Anything at or above 30 is '
        + 'still an A+.'));
      var rows = el('div', 'rows');
      var row = el('div', 'row');
      row.appendChild(el('div', 'row__name', 'Special Topics rating'));
      row.appendChild(ratingControl(state.specialTopics, PDS_OPTIONS, function (value) {
        state.specialTopics = value;
        markSetByHand('specialTopics');
        commit();
      }));
      rows.appendChild(row);
      SPECIAL_TOPICS.forEach(function (a) {
        var r = el('div', 'row');
        r.appendChild(el('div', 'row__name', a.name));
        r.appendChild(el('span', 'row__zy', 'covered by the rating above'));
        rows.appendChild(r);
      });
      block.appendChild(rows);
      body.appendChild(block);
    }
    card.appendChild(body);
    return card;
  }

  /** How many counted assessments can no longer move the grade. */
  function spentTally() {
    var spent = 0;
    var stranded = 0;
    var ids = gradableIds();
    ids.forEach(function (id) {
      var lv = assessmentLeverage(id, RELATIONS, results, byId, state.ratings);
      if (lv.status === 'no-gain' || lv.status === 'at-p') spent++;
      if (lv.status === 'no-gain' && !lv.workCanHelp) stranded++;
    });
    return { spent: spent, stranded: stranded, total: ids.length };
  }

  function renderSpentNote() {
    var tally = spentTally();
    var node = $('#spent-note');
    node.textContent = '';
    $('#hide-spent').checked = hideSpent;
    if (!tally.spent) {
      node.textContent = 'Every assessment can still change your grade.';
      return;
    }
    node.append(
      Object.assign(el('b'), { textContent: tally.spent + ' of ' + tally.total }),
      ' can no longer raise your grade \u2014 either already at P, or every subgoal they '
      + 'count in is at P, and a subgoal cannot go higher.',
    );
    if (tally.stranded) {
      node.append(' ' + tally.stranded + ' of those ' + (tally.stranded === 1 ? 'is' : 'are')
        + ' not needed anywhere else either.');
    }
  }

  function renderGoals() {
    var host = $('#goal-list');
    host.textContent = '';
    var shown = 0;

    GOAL_KEYS.forEach(function (key) {
      if (!goalMatchesFilter(key)) return;
      host.appendChild(goalCard(key));
      shown++;
    });
    if (goalMatchesFilter('exams')) {
      host.appendChild(examsCard());
      shown++;
    }
    if (!filterText || 'special topics bonus'.indexOf(filterText) !== -1) {
      host.appendChild(specialTopicsCard());
      shown++;
    }

    if (shown === 0) {
      host.appendChild(el('p', 'empty-note', 'Nothing matches “' + filterText + '”.'));
    }

    renderSpentNote();
  }

  /* ------------------------------------------------------- render: rules -- */

  /* ---------------------------------------------------------------- sync -- */

  /**
   * Grades are pulled in by a bookmarklet the user runs on Canvas or
   * Gradescope. It cannot talk to this page directly -- different origin -- so
   * it either drops the scrape at /api/sync/<token> for this tab to collect,
   * or, when a Content-Security-Policy blocks that, opens this page with the
   * payload in the URL fragment. Fragments never reach a server, so that path
   * stays entirely on the machine.
   *
   * The token is a bearer secret. It is generated here, kept in localStorage,
   * and never sent anywhere except in the sync URL itself.
   */

  /**
   * Record that the user set this themselves.
   *
   * Their own word outranks a scrape, so it is stored at full strength and
   * stamped now -- the next import will not quietly undo it.
   */
  function markSetByHand(target) {
    state.provenance[target] = { source: 'you', at: Date.now(), strength: 2 };
  }

  function syncToken() {
    var token;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (err) { token = null; }
    if (token && /^[A-Za-z0-9-]{16,64}$/.test(token)) return token;
    token = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 14);
    try { localStorage.setItem(TOKEN_KEY, token); } catch (err) { /* ignore */ }
    return token;
  }

  function rotateToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (err) { /* ignore */ }
    renderSync();
    toast('New sync link created. Reinstall your bookmarklet.');
  }

  /**
   * Merge a scraped payload in and note what came from where.
   *
   * Everything already held is passed back into `ingest`, including the
   * provenance map, so a Gradescope scrape cannot flatten a Canvas mark and a
   * replayed old payload cannot undo a newer one.
   */
  function applyScrape(payload) {
    var result = ingest(DATA, payload, {
      ratings: state.ratings,
      zyScores: state.zyScores,
      exams: state.exams,
      specialTopics: state.specialTopics,
      provenance: state.provenance,
      officialGoals: state.officialGoals,
    });

    state.ratings = result.ratings;
    state.zyScores = result.zyScores;
    state.exams = result.exams;
    state.provenance = result.provenance;
    state.officialGoals = result.officialGoals;
    if (result.specialTopics) state.specialTopics = result.specialTopics;
    seedRatings();

    var source = payload.source || 'unknown';
    state.syncs[source] = {
      at: new Date().toISOString(),
      rows: (payload.items || []).length,
      matched: result.matched.length,
      skipped: result.skipped.length,
      overruled: result.overruled.length,
      unmatched: result.unmatched.slice(0, 40).map(function (u) { return u.name; }),
    };

    commit();
    toast(result.matched.length
      ? 'Merged ' + result.matched.length + ' ' + plural(result.matched.length, 'grade')
        + ' from ' + source
      : 'Nothing new from ' + source + ' — what you already have is newer');
    return result;
  }

  /** Collect anything waiting in the relay. Quiet when there is nothing. */
  function pollSync(announce) {
    return fetch('/api/sync/' + encodeURIComponent(syncToken()), { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 404) {
          if (announce) toast('Nothing waiting. Run the bookmarklet on Canvas first.');
          return null;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) { if (payload) applyScrape(payload); return payload; })
      .catch(function () {
        if (announce) toast('Could not reach the sync relay.');
        return null;
      });
  }

  /** The offline path: payload arrives in the URL fragment. */
  function consumeHashImport() {
    var m = String(location.hash || '').match(/[#&]import=([^&]+)/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search);
    var payload;
    try {
      payload = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
    } catch (err) {
      toast('That import link was not readable.');
      return false;
    }
    if (!payload || !Array.isArray(payload.items)) {
      toast('That import link held no grades.');
      return false;
    }
    applyScrape(payload);
    return true;
  }

  function relativeTime(iso) {
    var then = Date.parse(iso);
    if (!then) return 'just now';
    var mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 minute ago';
    if (mins < 60) return mins + ' minutes ago';
    var hours = Math.round(mins / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return hours + ' hours ago';
    var days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : days + ' days ago';
  }

  function renderSync() {
    var token = syncToken();
    var link = $('#bookmarklet-link');
    link.setAttribute('href', buildBookmarklet(location.origin, token));

    // One line per source, because they are read at different times and cover
    // different ground: "last updated" is only meaningful per source.
    var status = $('#sync-status');
    status.textContent = '';
    var names = Object.keys(state.syncs).sort();
    if (!names.length) {
      status.textContent = 'No grades imported yet.';
      status.className = 'sync-status';
    } else {
      status.className = 'sync-status sync-status--done';
      var list = el('ul', 'sync-sources');
      names.forEach(function (name) {
        var info = state.syncs[name];
        var li = el('li');
        li.append(
          Object.assign(el('b'), { textContent: name }),
          ' \u00b7 ' + relativeTime(info.at)
            + ' \u00b7 ' + info.matched + ' of ' + info.rows + ' rows applied',
        );
        var notes = [];
        if (info.skipped) notes.push(info.skipped + ' not marked yet');
        if (info.overruled) notes.push(info.overruled + ' already covered');
        if (notes.length) li.appendChild(el('span', 'sync-sources__note', ' (' + notes.join(', ') + ')'));
        list.appendChild(li);
      });
      status.appendChild(list);

      var counted = 0;
      Object.keys(state.provenance).forEach(function (key) {
        if (state.provenance[key] && state.provenance[key].strength >= 2) counted++;
      });
      status.appendChild(el('p', 'sync-sources__total',
        counted + ' ' + plural(counted, 'grade') + ' now come from an import; '
        + 'the rest are still at S or set by hand.'));
    }

    // Canvas records an official rating per learning goal. When one is filled
    // in, say so -- and say loudly if it disagrees with what this derived.
    var official = $('#sync-official');
    official.textContent = '';
    var goals = state.officialGoals || {};
    var keys = Object.keys(goals);
    if (keys.length) {
      var agree = [];
      var differ = [];
      keys.sort().forEach(function (key) {
        var mine = results.goals[key] && results.goals[key].rating;
        if (goals[key] === mine) {
          agree.push('LG ' + key);
        } else {
          differ.push('LG ' + key + ' (Canvas ' + goals[key] + ', here ' + mine + ')');
        }
      });
      official.className = differ.length ? 'sync-official sync-official--differs' : 'sync-official';
      official.textContent = differ.length
        ? 'Your instructors have recorded a rating that differs from what this works out: '
          + differ.join(', ') + '. Theirs is the real one — ask them about the difference.'
        : 'Matches the ratings your instructors recorded for ' + agree.length + ' '
          + plural(agree.length, 'goal') + '.';
    }

    var unmatched = $('#sync-unmatched');
    unmatched.textContent = '';
    var seenUnmatched = {};
    Object.keys(state.syncs).forEach(function (src) {
      (state.syncs[src].unmatched || []).forEach(function (n) { seenUnmatched[n] = src; });
    });
    var names2 = Object.keys(seenUnmatched);
    if (names2.length) {
      var sum = el('summary', '', names2.length + ' ' + plural(names2.length, 'row')
        + ' did not match a course assessment');
      var det = el('details', 'sync-unmatched__details');
      det.appendChild(sum);
      var ul = el('ul');
      names2.forEach(function (n) { ul.appendChild(el('li', '', n + ' (' + seenUnmatched[n] + ')')); });
      det.appendChild(ul);
      det.appendChild(el('p', 'sync-unmatched__hint',
        'These are usually assignments outside the grade scheme. If one of them '
        + 'should have counted, the matching rules are in js/ingest.js.'));
      unmatched.appendChild(det);
    }
  }

  var pollTimer = null;
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'visible') pollSync(false);
    }, SYNC_POLL_MS);
  }

  /* ---------------------------------------------------------- repainting -- */

  function repaint() {
    score();
    renderSummary();
    renderLadder();
    renderLadderLegend();
    renderBreakdown();
    renderBlockers();
    renderGoals();
    renderSync();
  }

  function commit() {
    save();
    repaint();
  }

  /* --------------------------------------------------------- file in/out -- */

  function exportFile() {
    var payload = {
      version: FILE_VERSION,
      savedAt: new Date().toISOString(),
      course: 'CSE 2407',
      ratings: state.ratings,
      zyScores: state.zyScores,
      exams: state.exams,
      specialTopics: state.specialTopics,
      provenance: state.provenance,
      officialGoals: state.officialGoals,
      syncs: state.syncs,
      snapshot: {
        lgPoints: results.lgPoints,
        examPoints: results.examPoints,
        totalPoints: results.totalPoints,
        letterGrade: results.letterGrade,
      },
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = el('a');
    link.href = url;
    link.download = 'cse2407-grades-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('Saved to your downloads');
  }

  function importFile(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var payload;
      try {
        payload = JSON.parse(reader.result);
      } catch (err) {
        toast('That file is not valid JSON');
        return;
      }
      try {
        var dropped = countDropped(payload);
        adopt(payload);
        commit();
        var kept = Object.keys(state.ratings).length;
        toast(dropped
          ? 'Loaded ' + kept + ' grades, skipped ' + dropped + ' the app did not recognise'
          : 'Loaded ' + kept + ' ' + plural(kept, 'grade'));
      } catch (err) {
        toast('That file does not hold CSE 2407 grades');
      }
    };
    reader.onerror = function () { toast('Could not read that file'); };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!window.confirm('Reset every grade back to S? This cannot be undone.')) return;
    state.ratings = {};
    state.zyScores = {};
    state.exams = { exam1: null, exam2: null, exam3: null };
    state.specialTopics = null;
    state.provenance = {};
    state.officialGoals = {};
    state.syncs = {};
    seedRatings();
    commit();
    toast('Reset to S');
  }

  /* ---------------------------------------------------------------- wire -- */

  function wire() {
    $('#theme-btn').addEventListener('click', cycleTheme);
    $('#export-btn').addEventListener('click', exportFile);
    $('#import-btn').addEventListener('click', function () { $('#file-input').click(); });
    $('#file-input').addEventListener('change', importFile);
    $('#reset-btn').addEventListener('click', resetAll);

    $('#sync-check-btn').addEventListener('click', function () { pollSync(true); });
    $('#sync-rotate-btn').addEventListener('click', function () {
      if (window.confirm('Create a new sync link? Your old bookmarklet will stop working.')) {
        rotateToken();
      }
    });
    $('#bookmarklet-link').addEventListener('click', function (event) {
      event.preventDefault();
      toast('Drag this button to your bookmarks bar — clicking it here does nothing.');
    });

    var filterTimer = null;
    $('#filter-input').addEventListener('input', function (event) {
      var value = event.target.value.trim().toLowerCase();
      clearTimeout(filterTimer);
      filterTimer = setTimeout(function () {
        filterText = value;
        if (filterText) {
          GOAL_KEYS.forEach(function (key) { if (goalMatchesFilter(key)) state.open[key] = true; });
        }
        renderGoals();
      }, 120);
    });

    $('#hide-spent').addEventListener('change', function (event) {
      hideSpent = event.target.checked;
      renderGoals();
    });

    $('#expand-btn').addEventListener('click', function () {
      GOAL_KEYS.forEach(function (key) { state.open[key] = true; });
      state.open.exams = true;
      renderGoals();
    });
    $('#collapse-btn').addEventListener('click', function () {
      state.open = {};
      renderGoals();
    });
  }

  function start() {
    applyTheme(document.documentElement.dataset.theme || 'auto');
    restore();
    seedRatings();
    wire();
    repaint();
    if (!consumeHashImport()) pollSync(false);
    // A fragment-only navigation does not reload the document, so a second
    // handoff into an already-open tab has to be caught here.
    window.addEventListener('hashchange', consumeHashImport);
    startPolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
