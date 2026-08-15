/* LATENT — motion.js
 * Owner: D6 (Motion, performance & accessibility). Vanilla, no deps, no build step.
 * Built against D1's contract in site/STYLE.md §5 and styles.css §15.
 *
 * Design contract (SITE-V3-DESIGN-PLAN §0.3 — "motion earns its place"):
 *   1. The page is CORRECT AND COMPLETE WITHOUT THIS FILE. Every figure, bar width and
 *      section is already final in the HTML; this script only replays it.
 *   2. prefers-reduced-motion: reduce  =>  this file animates nothing. It does not
 *      shorten durations, it stands down and makes sure everything is visible.
 *      Re-checked live, so flipping the OS setting mid-visit settles the page at once.
 *   3. Motion only where it reveals data: counters count real figures, bars grow to
 *      real percentiles, sections reveal on approach. No parallax, no decorative drift.
 *
 *   THE INVARIANT, above all else: content is never left hidden. styles.css hides
 *   [data-reveal] up front, so every path out of this file — unsupported browser,
 *   reduced motion, cap reached, data-motion-off, an element that never intersects —
 *   ends by making the element visible. A missed animation is a blemish; a permanently
 *   invisible paragraph is a broken page.
 *
 * Wiring: assets/shell.html already ships the one line this needs, before </body>:
 *     <script src="{ROOT}assets/motion.js" defer></script>
 *
 * ---------------------------------------------------------------------------
 * API — mark up the FINAL value, then add the attribute.
 * ---------------------------------------------------------------------------
 *  data-reveal          fade+rise on approach. Adds `.is-in` (D1's class).
 *                       Optional data-reveal-delay="120"
 *  data-reveal-group    on a PARENT: staggers its [data-reveal] children.
 *                       Optional data-reveal-stagger="70"
 *  data-countup         on an element whose text IS the number. The target,
 *                       separators, decimals and any prefix/suffix are PARSED FROM
 *                       ITS OWN TEXT — no value attribute, so the animated number
 *                       and the no-JS number cannot drift apart.
 *                       Optional data-countup-duration="1400"
 *  data-motion-off      on a container: nothing inside is ever animated.
 *
 *  Percentile bars need NO attribute: every .pbar carrying --w is adopted
 *  automatically and grown from 0% to its real --w. Use data-bar to opt a
 *  non-.pbar element in.
 *
 * After client-side re-render (D3's filter/paginate):
 *     Latent.motion.refresh(container)   // scan newly inserted content
 *     Latent.motion.settle(container)    // force everything inside to final state
 */
(function () {
  "use strict";

  var REVEAL_CAP = 300;                  // ceiling on tracked reveals per page
  var ROOT_MARGIN = "0px 0px -12% 0px";  // fire slightly before fully in view
  var DEFAULT_COUNT_MS = 1400;
  var MAX_COUNT_MS = 2000;

  var doc = document;
  var root = doc.documentElement;

  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reducedMotion() { return !!(mq && mq.matches); }

  var supported = !!(window.IntersectionObserver && window.requestAnimationFrame &&
                     root.classList && Element.prototype.closest);

  var tracked = [];   // everything we touched, for settle()
  var pending = [];   // observed but not yet fired — drained by the scroll-end guard
  var revealCount = 0;
  var io = null;

  // --- the invariant ----------------------------------------------------------------

  /* styles.css hides [data-reveal] whenever <html> has .js. Anything we decline to
     animate must therefore be shown explicitly. Cheap, idempotent, called from every
     bail path. */
  function show(el) { el.classList.add("is-in"); }

  /* Show with no fade. Used by every path that decided NOT to animate this element —
     a bail-out should look like the element was simply never animated, not like a
     late fade-in. Suppressing the stylesheet transition for one frame does that. */
  function showInstant(el) {
    if (el.classList.contains("is-in")) return;
    el.style.transition = "none";
    el.classList.add("is-in");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.style.transition = ""; });
    });
  }

  function showAll(scope) {
    var list = (scope || doc).querySelectorAll("[data-reveal]:not(.is-in)");
    for (var i = 0; i < list.length; i++) showInstant(list[i]);
  }

  // --- helpers ----------------------------------------------------------------------

  function inViewport(el) {
    var r = el.getBoundingClientRect();
    return r.top < (window.innerHeight || root.clientHeight) && r.bottom > 0;
  }
  function isOff(el) { return !!el.closest("[data-motion-off]"); }
  function markDone(el) { el.setAttribute("data-motion-done", ""); }
  function isDone(el) { return el.hasAttribute("data-motion-done"); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }   // easeOutCubic

  /* `cancelled` lets settle() stop an animation that is already in flight — without it
     a running count-up keeps writing frames over the final value it was just given. */
  function run(ms, step, cancelled) {
    var start = null;
    function frame(now) {
      if (cancelled && cancelled()) return;
      if (start === null) start = now;
      var t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
      step(ease(t));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // --- count-up ---------------------------------------------------------------------

  /* Parse "€1,234.5m" -> {prefix:"€", target:1234.5, suffix:"m", decimals:1, ...}
     null when the text holds no number we can safely re-render. */
  function parseFigure(text) {
    var m = text.match(/-?\d[\d.,  \s]*/);
    if (!m) return null;
    var raw = m[0];
    var prefix = text.slice(0, m.index);
    var suffix = text.slice(m.index + raw.length);

    var trail = raw.match(/[.,\s  ]+$/);
    if (trail) { suffix = trail[0] + suffix; raw = raw.slice(0, -trail[0].length); }

    // The last separator is decimal only when followed by 1-2 digits and unrepeated:
    // "199,050" is grouping, "12.5" is decimal.
    var decSep = "", groupSep = "", decimals = 0;
    var cand = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
    if (cand > -1) {
      var sep = raw.charAt(cand);
      var after = raw.length - cand - 1;
      var occurrences = raw.split(sep).length - 1;
      if (after > 0 && after <= 2 && occurrences === 1) { decSep = sep; decimals = after; }
    }
    var marks = raw.match(/[,.\s  ]/g) || [];
    for (var i = 0; i < marks.length; i++) {
      if (marks[i] !== decSep) { groupSep = marks[i]; break; }
    }

    var numeric = raw;
    if (groupSep) numeric = numeric.split(groupSep).join("");
    if (decSep) numeric = numeric.replace(decSep, ".");
    var target = parseFloat(numeric);
    if (!isFinite(target)) return null;

    return { prefix: prefix, suffix: suffix, target: target, decimals: decimals,
             groupSep: groupSep, decSep: decSep || "." };
  }

  function formatFigure(f, value) {
    var parts = Math.abs(value).toFixed(f.decimals).split(".");
    if (f.groupSep) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, f.groupSep);
    return f.prefix + (value < 0 ? "-" : "") +
           parts[0] + (parts[1] ? f.decSep + parts[1] : "") + f.suffix;
  }

  function setupCount(el) {
    if (isDone(el)) return;
    if (isOff(el)) { markDone(el); return; }

    var final = el.textContent;
    var f = parseFigure(final);
    if (!f) { markDone(el); return; }        // not a number — leave the text alone

    // Reserve the final width so counting cannot reflow the layout around it.
    // (--f-num is tabular, so the digit width is already stable.)
    var w = el.getBoundingClientRect().width;
    if (w) { el.style.display = "inline-block"; el.style.minWidth = w + "px"; }

    var ms = Math.min(MAX_COUNT_MS,
      parseInt(el.getAttribute("data-countup-duration"), 10) || DEFAULT_COUNT_MS);

    el.__motionKind = "text";
    el.__motionFinal = final;
    tracked.push(el);

    observe(el, function () {
      el.textContent = formatFigure(f, 0);
      run(ms, function (p) {
        el.textContent = p >= 1 ? final : formatFigure(f, f.target * p);
      }, function () { return el.__motionStop === true; });
      markDone(el);
    });
  }

  // --- percentile bars --------------------------------------------------------------

  /* D1's contract: .pbar carries --w, .pb-fill is `width: var(--w,0%)` with an .8s
     width transition. We drop --w to 0%, then restore the real value in view.
     The real value is read from the element itself and stashed, so it can always be
     put back — a bar we fail to animate must never be left reading 0%. */
  function setupBar(el) {
    if (isDone(el)) return;
    if (isOff(el)) { markDone(el); return; }

    var finalW = (el.style.getPropertyValue("--w") || "").trim();
    if (!finalW) {
      finalW = (getComputedStyle(el).getPropertyValue("--w") || "").trim();
    }
    if (!finalW || finalW === "0%" || finalW === "0") { markDone(el); return; }

    el.__motionKind = "bar";
    el.__motionFinal = finalW;
    tracked.push(el);

    el.style.setProperty("--w", "0%");

    observe(el, function () {
      // next frame, so the 0% is committed and the transition has something to run from
      requestAnimationFrame(function () {
        el.style.setProperty("--w", finalW);
        markDone(el);
      });
    });
  }

  function adoptBars(scope) {
    var bars = scope.querySelectorAll(".pbar:not([data-bar]):not([data-motion-done])");
    for (var i = 0; i < bars.length; i++) {
      if ((bars[i].style.getPropertyValue("--w") || "").trim()) {
        bars[i].setAttribute("data-bar", "");
      }
    }
  }

  // --- scroll reveal ----------------------------------------------------------------

  function setupReveal(el) {
    if (isDone(el)) return;

    // Not animated -> must be shown. This is the invariant, two ways.
    if (isOff(el) || revealCount >= REVEAL_CAP) { showInstant(el); markDone(el); return; }

    // Already on screen when we start: show it outright rather than fading it in.
    // The visitor is looking at this content now; animating it would be a flash, and
    // it must never be hidden waiting for a scroll that has already happened.
    if (inViewport(el)) { showInstant(el); markDone(el); return; }

    revealCount++;
    var delay = parseInt(el.getAttribute("data-reveal-delay"), 10) || 0;

    var group = el.parentElement && el.parentElement.closest("[data-reveal-group]");
    if (group && !el.hasAttribute("data-reveal-delay")) {
      var step = parseInt(group.getAttribute("data-reveal-stagger"), 10) || 70;
      var sibs = group.querySelectorAll("[data-reveal]");
      for (var i = 0; i < sibs.length; i++) if (sibs[i] === el) { delay = i * step; break; }
    }

    el.__motionKind = "reveal";
    tracked.push(el);

    observe(el, function () {
      if (delay) {
        el.style.transitionDelay = delay + "ms";
        window.setTimeout(function () { el.style.transitionDelay = ""; }, delay + 700);
      }
      show(el);
      markDone(el);
    });
  }

  // --- observation ------------------------------------------------------------------

  function observe(el, fire) {
    el.__motionFire = fire;
    pending.push(el);
    io.observe(el);
    if (pending.length === 1) bindGuard();
  }

  function fireNow(el) {
    io.unobserve(el);                    // one-shot: never re-animate on scroll back
    var fire = el.__motionFire;
    el.__motionFire = null;
    var i = pending.indexOf(el);
    if (i > -1) pending.splice(i, 1);
    if (!pending.length) unbindGuard();
    if (fire) fire();
  }

  function onIntersect(entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) fireNow(entries[i].target);
    }
  }

  /* ROOT_MARGIN shrinks the root's bottom edge so effects fire slightly early. The
     cost: anything sitting inside that band when the page is scrolled as far as it
     goes can never intersect — footer-adjacent content would stay hidden forever, and
     its bars would read 0%. This guard closes the hole: once the document cannot
     scroll further, everything still pending and on screen is fired outright. */
  var guardQueued = false, guardBound = false;

  function atScrollEnd() {
    var scrolled = window.pageYOffset || root.scrollTop || 0;
    var viewport = window.innerHeight || root.clientHeight;
    var full = Math.max(doc.body ? doc.body.scrollHeight : 0, root.scrollHeight);
    return scrolled + viewport >= full - 2;
  }

  function guard() {
    if (guardQueued) return;
    guardQueued = true;
    requestAnimationFrame(function () {
      guardQueued = false;
      if (!pending.length || !atScrollEnd()) return;
      var viewport = window.innerHeight || root.clientHeight;
      var stuck = pending.filter(function (el) {
        return el.getBoundingClientRect().top < viewport;
      });
      for (var i = 0; i < stuck.length; i++) fireNow(stuck[i]);
    });
  }

  function bindGuard() {
    if (guardBound) return;
    guardBound = true;
    window.addEventListener("scroll", guard, { passive: true });
    window.addEventListener("resize", guard, { passive: true });
    guard();                              // covers a page too short to scroll at all
  }

  function unbindGuard() {
    if (!guardBound) return;
    guardBound = false;
    window.removeEventListener("scroll", guard);
    window.removeEventListener("resize", guard);
  }

  // --- settle -----------------------------------------------------------------------

  /* Put everything into its final, correct state and stop. Used when reduced-motion
     turns on mid-visit, and exposed for anyone who needs a guaranteed-static page. */
  function settle(scope) {
    scope = scope || doc;
    if (io) io.disconnect();
    pending.length = 0;
    unbindGuard();

    for (var i = 0; i < tracked.length; i++) {
      var el = tracked[i];
      if (scope !== doc && !scope.contains(el)) continue;
      el.__motionFire = null;
      el.__motionStop = true;         // stop any count-up already mid-flight
      el.style.transitionDelay = "";
      if (el.__motionKind === "bar" && el.__motionFinal) {
        el.style.setProperty("--w", el.__motionFinal);
      } else if (el.__motionKind === "text" && el.__motionFinal != null) {
        el.textContent = el.__motionFinal;
      }
      markDone(el);
    }
    showAll(scope);
  }

  // --- scan -------------------------------------------------------------------------

  function refresh(scope) {
    scope = scope || doc;
    if (!supported || reducedMotion()) { showAll(scope); return; }

    adoptBars(scope);
    var i, list;
    list = scope.querySelectorAll("[data-countup]:not([data-motion-done])");
    for (i = 0; i < list.length; i++) setupCount(list[i]);
    list = scope.querySelectorAll("[data-bar]:not([data-motion-done])");
    for (i = 0; i < list.length; i++) setupBar(list[i]);
    list = scope.querySelectorAll("[data-reveal]:not([data-motion-done])");
    for (i = 0; i < list.length; i++) setupReveal(list[i]);
  }

  // --- init -------------------------------------------------------------------------

  function init() {
    window.Latent = window.Latent || {};
    window.Latent.motion = {
      refresh: function (scope) { refresh(scope); },
      settle: settle,
      get enabled() { return supported && !reducedMotion(); }
    };

    // Old browser, or the visitor asked for no motion: show everything and stand down.
    // styles.css already forces [data-reveal] visible under reduced-motion, but we do
    // it here too so the invariant does not depend on a stylesheet loading.
    if (!supported || reducedMotion()) { showAll(doc); return; }

    io = new IntersectionObserver(onIntersect, { rootMargin: ROOT_MARGIN, threshold: 0 });
    root.classList.add("motion-on");
    refresh(doc);

    if (mq) {
      var onChange = function () {
        if (mq.matches) { root.classList.remove("motion-on"); settle(doc); }
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
