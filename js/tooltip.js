/**
 * Tooltips, in our own markup.
 *
 * A native `title` is slow to appear, unstyled, truncated on some platforms,
 * and never shown on touch at all — which is no good for text that explains
 * why a grade cannot move. This replaces it with one shared bubble driven by a
 * `data-tip` attribute.
 *
 * Usage: put `data-tip="..."` on any element. Nothing else is required.
 *
 * Behaviour it is careful about:
 *   - Keyboard as well as pointer: focusin shows, focusout hides.
 *   - Escape dismisses without moving focus, per WCAG 1.4.13.
 *   - Touch: a tap shows it, the next tap elsewhere hides it.
 *   - Screen readers: the bubble is role="tooltip" and the trigger is given
 *     aria-describedby while it is open, so the text is announced as a
 *     description rather than replacing the element's own name.
 *   - Stays on screen: flips above/below and is clamped horizontally.
 */
(function () {
  'use strict';

  var TIP_ID = 'tip-bubble';
  var SHOW_DELAY = 120;
  var MARGIN = 8;

  var bubble = null;
  var current = null;
  var showTimer = null;

  function ensureBubble() {
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.id = TIP_ID;
    bubble.className = 'tip';
    bubble.setAttribute('role', 'tooltip');
    bubble.hidden = true;
    document.body.appendChild(bubble);
    return bubble;
  }

  function hide() {
    clearTimeout(showTimer);
    if (!current) return;
    current.removeAttribute('aria-describedby');
    current = null;
    if (bubble) {
      bubble.hidden = true;
      bubble.classList.remove('tip--on');
    }
  }

  function place(target) {
    var box = target.getBoundingClientRect();
    var tip = bubble.getBoundingClientRect();

    // Below by default; above when there is not room underneath.
    var below = box.bottom + MARGIN;
    var above = box.top - tip.height - MARGIN;
    var top = (below + tip.height <= window.innerHeight || above < MARGIN) ? below : above;
    bubble.classList.toggle('tip--above', top === above);

    var left = box.left + (box.width / 2) - (tip.width / 2);
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - tip.width - MARGIN));

    bubble.style.top = Math.round(top + window.scrollY) + 'px';
    bubble.style.left = Math.round(left + window.scrollX) + 'px';
  }

  function show(target) {
    var text = target.getAttribute('data-tip');
    if (!text) return;

    ensureBubble();
    hide();
    current = target;

    bubble.textContent = text;
    bubble.hidden = false;
    // Measure with the final text in place, then position, then reveal.
    bubble.style.top = '-9999px';
    bubble.style.left = '-9999px';
    place(target);
    bubble.classList.add('tip--on');
    target.setAttribute('aria-describedby', TIP_ID);
  }

  function triggerFrom(node) {
    return node && node.closest ? node.closest('[data-tip]') : null;
  }

  function onEnter(event) {
    var target = triggerFrom(event.target);
    if (!target || target === current) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(function () { show(target); }, SHOW_DELAY);
  }

  function onLeave(event) {
    var target = triggerFrom(event.target);
    if (!target) return;
    // Ignore moves between descendants of the same trigger.
    if (event.relatedTarget && triggerFrom(event.relatedTarget) === target) return;
    hide();
  }

  document.addEventListener('mouseover', onEnter);
  document.addEventListener('mouseout', onLeave);
  document.addEventListener('focusin', function (event) {
    var target = triggerFrom(event.target);
    if (target) show(target);
  });
  document.addEventListener('focusout', hide);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && current) {
      event.stopPropagation();
      hide();
    }
  });

  // Touch: show on tap, and let the next tap anywhere else dismiss it.
  document.addEventListener('touchstart', function (event) {
    var target = triggerFrom(event.target);
    if (target) show(target);
    else hide();
  }, { passive: true });

  // Anything that moves the page out from under the bubble closes it.
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TIP_ID };
  }
})();
