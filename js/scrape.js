/**
 * The bookmarklet body. Runs on a Canvas grades page or a Gradescope course
 * page, reads the grade table, and hands the rows back to the calculator.
 *
 * Scope, deliberately narrow: this reads the rendered DOM and nothing else.
 * It does not touch cookies, localStorage, sessionStorage or any API on the
 * host site, and it sends only assignment names, ids and scores.
 *
 * Delivery, in order of preference:
 *   1. POST to the calculator's /api/sync endpoint, so a tab you already have
 *      open picks the data up on its own.
 *   2. If that is blocked -- a Content-Security-Policy `connect-src` will stop
 *      it on some Canvas installs -- open the calculator in a new tab with the
 *      payload in the URL fragment. Fragments are never sent to a server, so
 *      this path is entirely local.
 *
 * ---------------------------------------------------------------------------
 * TUNING: the selectors below match Canvas's grade summary table and
 * Gradescope's course assignment table as of Fall 2026. Each site block is
 * independent; adjust one without touching the other.
 * ---------------------------------------------------------------------------
 */
(function (config) {
  'use strict';

  var ORIGIN = config.origin;
  var TOKEN = config.token;
  var MAX_ITEMS = 400;

  function text(node) {
    return node ? String(node.textContent).replace(/\s+/g, ' ').trim() : '';
  }

  /**
   * Read a node's text with the invisible furniture removed.
   *
   * Canvas hides helper text inside the very elements worth reading: an
   * assignment title carries a "Links to an external site." screen-reader
   * span, and the score cell carries "Click to test a different score".
   * Both land in textContent and neither belongs in a name or a grade.
   */
  var NOISE = '.screenreader-only, .external_link_icon, .tooltip_wrap, .tooltip_text,'
    + ' .accessibility-warning, .hidden-readable';

  function cleanText(node) {
    if (!node) return '';
    var copy = node.cloneNode(true);
    var junk = copy.querySelectorAll ? copy.querySelectorAll(NOISE) : [];
    Array.prototype.forEach.call(junk, function (n) { n.parentNode.removeChild(n); });
    return String(copy.textContent).replace(/\s+/g, ' ').trim();
  }

  /* ------------------------------------------------------------- Canvas --- */

  function scrapeCanvas() {
    var items = [];
    var rows = document.querySelectorAll('#grades_summary tr.student_assignment');

    Array.prototype.forEach.call(rows, function (row) {
      var cls = row.className || '';
      // Canvas mixes its own roll-up rows into the same table.
      if (/group_total|final_grade|hard_coded/.test(cls)) return;

      var titleLink = row.querySelector('th.title a, td.title a');
      var name = cleanText(titleLink) || cleanText(row.querySelector('th.title, td.title'));
      if (!name) return;

      // Canvas stashes clean machine values in hidden spans next to the
      // rendered score. Prefer them: the visible .grade cell also contains
      // tooltip and screen-reader text ("Click to test a different score").
      var canvasId = text(row.querySelector('.assignment_id'));
      if (!canvasId) {
        var m = String(row.id || '').match(/(\d{3,})/);
        if (m) canvasId = m[1];
      }
      if (!canvasId && titleLink) {
        var hm = String(titleLink.getAttribute('href') || '').match(/assignments\/(\d+)/);
        if (hm) canvasId = hm[1];
      }

      var score = text(row.querySelector('.original_points'));
      if (!score) score = text(row.querySelector('.original_score'));

      // The denominator sits in a bare <span>/ 2</span> after .grade.
      var outOf = null;
      var scoreCell = row.querySelector('td.assignment_score');
      if (scoreCell) {
        var om = cleanText(scoreCell).match(/\/\s*([\d.]+)/);
        if (om) outOf = om[1];
      }

      items.push({
        canvasId: canvasId || null,
        name: name,
        grade: score || null,
        score: score || null,
        outOf: outOf,
      });
    });

    return items;
  }

  /* --------------------------------------------------------- Gradescope --- */

  function scrapeGradescope() {
    var items = [];
    var rows = document.querySelectorAll('#assignments-student-table tbody tr');

    Array.prototype.forEach.call(rows, function (row) {
      var name = cleanText(row.querySelector('th.table--primaryLink a'))
        || cleanText(row.querySelector('th.table--primaryLink'))
        || cleanText(row.querySelector('th'));
      if (!name) return;

      // Either a score ("12.0 / 12.0") or a status ("Submitted", "No Submission").
      var scoreText = text(row.querySelector('.submissionStatus--score'));
      var statusText = text(row.querySelector('.submissionStatus--text'));

      items.push({
        canvasId: null,
        name: name,
        grade: scoreText || statusText || null,
        outOf: null,
      });
    });

    return items;
  }

  /* ------------------------------------------------------------ dispatch -- */

  function detect() {
    var host = location.hostname;
    if (/gradescope/i.test(host)) return 'Gradescope';
    if (document.querySelector('#grades_summary')) return 'Canvas';
    if (/instructure|canvas/i.test(host)) return 'Canvas';
    return null;
  }

  function notify(message, tone) {
    var box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'left:50%', 'top:24px',
      'transform:translateX(-50%)', 'max-width:min(560px,90vw)',
      'padding:12px 16px', 'border-radius:10px',
      'font:14px/1.45 system-ui,sans-serif', 'color:#fff',
      'background:' + (tone === 'bad' ? '#a3203d' : '#0a6446'),
      'box-shadow:0 8px 28px rgba(0,0,0,.35)',
    ].join(';');
    box.textContent = message;
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 6000);
  }

  function handoffViaHash(payload) {
    var encoded;
    try {
      encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    } catch (e) {
      notify('CSE 2407: could not encode the grades found on this page.', 'bad');
      return;
    }
    window.open(ORIGIN + '/#import=' + encodeURIComponent(encoded), '_blank', 'noopener');
    notify('CSE 2407: opened the calculator with ' + payload.items.length + ' rows.');
  }

  var site = detect();
  if (!site) {
    notify('CSE 2407: this does not look like a Canvas grades page or a Gradescope course page.', 'bad');
    return;
  }

  var items = (site === 'Canvas' ? scrapeCanvas() : scrapeGradescope()).slice(0, MAX_ITEMS);
  if (!items.length) {
    notify('CSE 2407: found no assignment rows on this page. Make sure grades are showing, then try again.', 'bad');
    return;
  }

  var payload = {
    source: site,
    capturedAt: new Date().toISOString(),
    pageUrl: location.origin + location.pathname,
    items: items,
  };

  if (!TOKEN) { handoffViaHash(payload); return; }

  fetch(ORIGIN + '/api/sync/' + encodeURIComponent(TOKEN), {
    method: 'POST',
    // text/plain keeps this a CORS "simple request", so no preflight is needed.
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
  }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    notify('CSE 2407: sent ' + items.length + ' rows from ' + site + '. Your calculator tab will pick them up.');
  }).catch(function () {
    handoffViaHash(payload);
  });
})(window.__CSE2407_SYNC__ || { origin: 'http://localhost:8080', token: '' });
