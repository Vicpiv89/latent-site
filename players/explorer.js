/* Latent — player explorer.
   One row per qualifying player-season, filtered and sorted entirely in the
   browser from players/index.json. No framework, no dependency, no network
   call beyond that one file.

   Two rules are enforced structurally here rather than left to a footnote:
   1. Goalkeepers can never enter a ranked table. They are excluded from every
      outfield view and get their own column set (saves, minutes) when picked.
   2. The Export Index is a within-league-and-season percentile composite. The
      moment a view spans more than one cohort, the table says so in amber.
      Cross-cohort ordering is the Latent Level's job — it is the only figure
      on this site licensed to cross a league border, and only because its
      backtest is published. */
(function () {
  'use strict';

  var PAGE = 50;
  var $ = function (id) { return document.getElementById(id); };
  var tb = $('tb'), th = $('th'), pager = $('pager'), caveat = $('caveat'),
      fstate = $('fstate');
  var els = {
    q: $('q'), lg: $('lg'), ss: $('ss'), pos: $('pos'),
    agemax: $('agemax'), minmin: $('minmin'), latest: $('latest')
  };

  var DB = null;        // payload
  var COL = {};         // stat key -> row index
  var EI, LVL, SV, SV90;
  var isLatest = null;  // Uint8Array parallel to DB.d
  var state = { sort: 'lvl', dir: -1, page: 1 };

  // a row is [playerIx, clubIx, seasonIx, ...stats, ei, level, saves, saves/90].
  // Identity lives once in DB.p — 9.2k season rows share 4.6k players, so the
  // name and slug are looked up rather than repeated.
  function P(r) { return DB.p[r[0]]; }        // [slug, name, pos, natIx]
  function S(r) { return DB.seasons[r[2]]; }  // [leagueIx, label]
  // r[3] is the player's age *in that season*, not today — a 2021 row reading
  // 35 because the player is 35 now would misprice every historical season.

  // ---- column definitions ------------------------------------------------
  // get(r) returns the raw value used for sorting; cell(r) the rendered HTML.
  function num(v, dp) {
    if (v === null || v === undefined) return '<span class="dim">—</span>';
    return v.toFixed(dp === undefined ? 0 : dp);
  }
  function pct(v) {
    if (v === null || v === undefined) return '<span class="dim">—</span>';
    return (v * 100).toFixed(0) + '%';
  }

  var DASH = '<span class="dim">—</span>';

  var OUTFIELD_COLS = [
    { k: 'lvl', h: 'Level', w: 'Latent Level — cross-competition index, not a percentage',
      get: function (r) { return r[LVL]; },
      cell: function (r) { return r[LVL] === null ? DASH
        : '<span class="chip chip-solid"><span>' + r[LVL].toLocaleString() + '</span></span>'; } },
    { k: 'ei', h: 'Export Index', w: 'Within this competition and season only',
      get: function (r) { return r[EI]; },
      cell: function (r) { return r[EI] === null ? DASH
        : '<span class="chip"><span>' + r[EI].toFixed(1) + '</span></span>'; } },
    { k: 'min', h: 'Min', get: function (r) { return r[COL.min]; },
      cell: function (r) { return r[COL.min].toLocaleString(); } },
    { k: 'app', h: 'Apps', get: function (r) { return r[COL.app]; },
      cell: function (r) { return r[COL.app]; } },
    { k: 'g90', h: 'G/90', get: function (r) { return r[COL.g90]; },
      cell: function (r) { return num(r[COL.g90], 2); } },
    { k: 'a90', h: 'A/90', get: function (r) { return r[COL.a90]; },
      cell: function (r) { return num(r[COL.a90], 2); } },
    { k: 'kp90', h: 'KP/90', get: function (r) { return r[COL.kp90]; },
      cell: function (r) { return num(r[COL.kp90], 1); } },
    { k: 'dw', h: 'Duels won', get: function (r) { return r[COL.dw]; },
      cell: function (r) { return pct(r[COL.dw]); } },
    { k: 'pa', h: 'Pass acc', get: function (r) { return r[COL.pa]; },
      cell: function (r) { return pct(r[COL.pa]); } }
  ];

  var GK_COLS = [
    { k: 'min', h: 'Min', get: function (r) { return r[COL.min]; },
      cell: function (r) { return r[COL.min].toLocaleString(); } },
    { k: 'app', h: 'Apps', get: function (r) { return r[COL.app]; },
      cell: function (r) { return r[COL.app]; } },
    { k: 'sv', h: 'Saves', get: function (r) { return r[SV]; },
      cell: function (r) { return r[SV] === null ? DASH
        : '<span class="chip"><span>' + r[SV] + '</span></span>'; } },
    { k: 'sv90', h: 'Saves /90', w: 'Saves per 90 minutes of goalkeeping recorded',
      get: function (r) { return r[SV90]; },
      cell: function (r) { return num(r[SV90], 2); } },
    { k: 'pa', h: 'Pass acc', get: function (r) { return r[COL.pa]; },
      cell: function (r) { return pct(r[COL.pa]); } }
  ];

  function cols() { return els.pos.value === 'GK' ? GK_COLS : OUTFIELD_COLS; }

  // ---- URL state ---------------------------------------------------------
  var KEYS = ['q', 'lg', 'ss', 'pos', 'agemax', 'minmin'];

  function readURL() {
    var p = new URLSearchParams(location.search);
    KEYS.forEach(function (k) { if (p.has(k)) els[k].value = p.get(k); });
    els.latest.checked = p.get('latest') === '1';
    if (p.has('sort')) state.sort = p.get('sort');
    if (p.has('dir')) state.dir = p.get('dir') === 'a' ? 1 : -1;
    state.page = Math.max(1, parseInt(p.get('p') || '1', 10) || 1);
  }

  function writeURL() {
    var p = new URLSearchParams();
    KEYS.forEach(function (k) { if (els[k].value) p.set(k, els[k].value); });
    if (els.latest.checked) p.set('latest', '1');
    if (state.sort !== 'lvl') p.set('sort', state.sort);
    if (state.dir !== -1) p.set('dir', 'a');
    if (state.page > 1) p.set('p', String(state.page));
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  // ---- season dropdown ---------------------------------------------------
  function fillSeasons() {
    var want = els.ss.value, labels = [];
    DB.seasons.forEach(function (s, i) {
      var code = DB.leagues[s[0]][0];
      if (els.lg.value && code !== els.lg.value) return;
      if (labels.indexOf(s[1]) < 0) labels.push(s[1]);
    });
    if (!els.lg.value) labels.sort().reverse();
    els.ss.innerHTML = '<option value="">All seasons</option>' +
      labels.map(function (l) {
        return '<option' + (l === want ? ' selected' : '') + '>' + l + '</option>';
      }).join('');
    if (els.ss.value !== want) els.ss.value = '';
  }

  // ---- filtering ---------------------------------------------------------
  function filtered() {
    var s = els.q.value.trim().toLowerCase();
    var lg = els.lg.value, ss = els.ss.value, pos = els.pos.value;
    var amax = parseInt(els.agemax.value, 10);
    var mmin = parseInt(els.minmin.value, 10);
    var latestOnly = els.latest.checked;
    var d = DB.d, out = [];
    for (var i = 0; i < d.length; i++) {
      var r = d[i], pl = DB.p[r[0]];
      // goalkeepers exist in exactly one view: the goalkeeper view
      if (pos === 'GK') { if (pl[2] !== 'GK') continue; }
      else { if (pl[2] === 'GK') continue; if (pos && pl[2] !== pos) continue; }
      if (latestOnly && !isLatest[i]) continue;
      var sk = DB.seasons[r[2]];
      if (lg && DB.leagues[sk[0]][0] !== lg) continue;
      if (ss && sk[1] !== ss) continue;
      if (amax && (r[3] === null || r[3] > amax)) continue;
      if (mmin && r[COL.min] < mmin) continue;
      if (s && r.key.indexOf(s) < 0) continue;
      out.push(r);
    }
    return out;
  }

  function sortRows(hits) {
    var c = null, list = cols();
    for (var i = 0; i < list.length; i++) if (list[i].k === state.sort) c = list[i];
    var dir = state.dir;
    if (state.sort === 'name') {
      hits.sort(function (a, b) { return dir * P(a)[1].localeCompare(P(b)[1]); });
      return;
    }
    if (state.sort === 'age') {
      hits.sort(function (a, b) {
        var x = a[3] === null ? 999 : a[3], y = b[3] === null ? 999 : b[3];
        return dir * (x - y) || P(a)[1].localeCompare(P(b)[1]);
      });
      return;
    }
    if (!c) c = list[0];
    hits.sort(function (a, b) {
      var x = c.get(a), y = c.get(b);
      // a missing figure is missing, not zero — it always sinks
      if (x === null || x === undefined) return (y === null || y === undefined) ? 0 : 1;
      if (y === null || y === undefined) return -1;
      return dir * (x - y) || (b[COL.min] - a[COL.min]);
    });
  }

  // ---- the caveat bar ----------------------------------------------------
  function updateCaveat(hits) {
    if (state.sort !== 'ei') { caveat.hidden = true; return; }
    var lgs = {}, cohorts = {};
    for (var i = 0; i < hits.length; i++) {
      lgs[DB.seasons[hits[i][2]][0]] = 1;
      cohorts[hits[i][2]] = 1;
    }
    var nl = Object.keys(lgs).length, nc = Object.keys(cohorts).length;
    if (nl > 1) {
      caveat.className = 'callout callout-warn';
      caveat.innerHTML = '<span class="callout-title">Not a like-for-like ranking</span>' +
        'The Export Index is a composite of percentiles taken <em>inside</em> one ' +
        'competition and season, so ordering ' + nl + ' competitions by it compares each ' +
        'player against a different set of peers. Pick one competition and season for a ' +
        'real ranking — or sort by <button class="linkbtn" data-sort="lvl">Latent ' +
        'Level</button>, which is built to cross that border and ' +
        '<a href="../methodology.html">publishes its backtest</a>.';
      caveat.hidden = false;
    } else if (nc > 1) {
      caveat.className = 'callout';
      caveat.innerHTML = '<span class="callout-title">' + nc + ' seasons in view</span>' +
        'Percentiles are ranked inside a single season\'s cohort, so Export Index figures ' +
        'from different seasons of this competition sit on different scales. Pick one ' +
        'season for a strict ranking.';
      caveat.hidden = false;
    } else {
      caveat.hidden = true;
    }
  }

  // ---- render ------------------------------------------------------------
  function render() {
    var hits = filtered();
    sortRows(hits);
    updateCaveat(hits);

    var pages = Math.max(1, Math.ceil(hits.length / PAGE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE;
    var list = cols();
    var gk = els.pos.value === 'GK';

    // identity collapses into one cell — club, competition, season and position
    // ride under the name, which keeps the stat columns reachable on a phone
    var h = '<tr><th class="rank" title="Position in this view — not a competition rank">' +
      '#</th>' + sortable('name', 'Player', false) +
      sortable('age', 'Age', true, 'Age at the end of that season, not age today');
    for (var i = 0; i < list.length; i++) {
      h += sortable(list[i].k, list[i].h, true, list[i].w);
    }
    th.innerHTML = h + '</tr>';

    var body = '';
    for (var j = start; j < Math.min(start + PAGE, hits.length); j++) {
      var r = hits[j], pl = P(r), sk = S(r), lgc = DB.leagues[sk[0]][0];
      var club = r[1] < 0 ? '' : DB.clubs[r[1]];
      var nat = pl[3] < 0 ? '' : DB.nats[pl[3]];
      var line = [];
      if (club) line.push(club);
      line.push(lgc + ' ' + sk[1]);
      if (!gk) line.push(pl[2]);
      if (nat) line.push(nat);
      body += '<tr data-h="' + pl[0] + '">' +
        '<td class="rank">' + (j + 1) + '</td>' +
        '<td class="who"><a href="' + pl[0] + '.html">' + esc(pl[1]) + '</a>' +
        '<span class="sub">' + esc(line.join(' · ')) + '</span></td>' +
        '<td class="n">' + (r[3] === null ? '—' : r[3]) + '</td>';
      for (var k = 0; k < list.length; k++) body += '<td class="n">' + list[k].cell(r) + '</td>';
      body += '</tr>';
    }
    tb.innerHTML = body || '<tr><td class="tc dim" colspan="14">' +
      'No player-season matches these filters. ' +
      '<button class="linkbtn" id="clr">Clear them</button></td></tr>';

    fstate.textContent = hits.length.toLocaleString() + ' player-season' +
      (hits.length === 1 ? '' : 's') + ' · ' +
      countPlayers(hits).toLocaleString() + ' distinct players' +
      (els.pos.value === 'GK'
        ? ' · goalkeeper view: no index, no rank'
        : ' · goalkeepers excluded — neither index contains a goalkeeping action');

    pager.innerHTML = pages > 1
      ? '<button ' + (state.page <= 1 ? 'disabled' : '') + ' data-go="-1">‹ Prev</button>' +
        '<span class="pnum meta">page <span class="num">' + state.page +
        '</span> of <span class="num">' + pages + '</span></span>' +
        '<button ' + (state.page >= pages ? 'disabled' : '') + ' data-go="1">Next ›</button>'
      : '';
    writeURL();
  }

  function countPlayers(hits) {
    var seen = Object.create(null), n = 0;
    for (var i = 0; i < hits.length; i++) if (!seen[hits[i][0]]) { seen[hits[i][0]] = 1; n++; }
    return n;
  }

  /* D1's contract: the arrow is drawn from aria-sort, so screen readers get the
     sort state for free and the stylesheet owns the glyph. */
  function sortable(key, label, isNum, why) {
    var on = state.sort === key;
    var aria = on ? (state.dir === -1 ? 'descending' : 'ascending') : 'none';
    return '<th' + (isNum ? ' class="n"' : '') + ' aria-sort="' + aria + '"' +
      (why ? ' title="' + why + '"' : '') +
      '><button class="sort" type="button" data-sort="' + key + '">' + label +
      '</button></th>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- events ------------------------------------------------------------
  function onFilterChange() { state.page = 1; render(); }

  var debounce;
  els.q.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(onFilterChange, 110);
  });
  els.lg.addEventListener('change', function () { fillSeasons(); onFilterChange(); });
  els.pos.addEventListener('change', function () {
    // leaving/entering goalkeeper mode swaps the column set — keep the sort legal
    var list = cols(), ok = false;
    for (var i = 0; i < list.length; i++) if (list[i].k === state.sort) ok = true;
    if (!ok && state.sort !== 'name' && state.sort !== 'age') {
      state.sort = els.pos.value === 'GK' ? 'min' : 'lvl';
      state.dir = -1;
    }
    onFilterChange();
  });
  ['ss', 'agemax', 'minmin', 'latest'].forEach(function (k) {
    els[k].addEventListener('change', onFilterChange);
  });

  document.addEventListener('click', function (e) {
    var sortEl = e.target.closest('[data-sort]');
    if (sortEl) {
      var k = sortEl.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = (k === 'name') ? 1 : -1; }
      state.page = 1;
      render();
      return;
    }
    var go = e.target.closest('[data-go]');
    if (go) {
      state.page += parseInt(go.getAttribute('data-go'), 10);
      render();
      window.scrollTo({ top: document.querySelector('.tblwrap').offsetTop - 20 });
      return;
    }
    if (e.target.closest('#reset') || e.target.closest('#clr')) {
      KEYS.forEach(function (k) { els[k].value = ''; });
      els.latest.checked = false;
      state.sort = 'lvl'; state.dir = -1; state.page = 1;
      fillSeasons();
      render();
      return;
    }
    var row = e.target.closest('tr[data-h]');
    if (row && e.target.tagName !== 'A') location.href = row.getAttribute('data-h') + '.html';
  });

  // ---- boot --------------------------------------------------------------
  fetch('index.json').then(function (r) { return r.json(); }).then(function (data) {
    DB = data;
    var base = 4;
    DB.stats.forEach(function (s, i) { COL[s[0]] = base + i; });
    EI = base + DB.stats.length;
    LVL = EI + 1; SV = LVL + 1; SV90 = SV + 1;

    // search key + latest-season flag. Python emits each player's seasons
    // newest-first, so the first row carrying a player is that player's latest.
    isLatest = new Uint8Array(DB.d.length);
    var seen = Object.create(null);
    for (var i = 0; i < DB.d.length; i++) {
      var r = DB.d[i], pl = DB.p[r[0]];
      r.key = (pl[1] + ' ' + (r[1] < 0 ? '' : DB.clubs[r[1]]) + ' ' +
               (pl[3] < 0 ? '' : DB.nats[pl[3]])).toLowerCase();
      if (!seen[r[0]]) { seen[r[0]] = 1; isLatest[i] = 1; }
    }
    readURL();
    fillSeasons();
    readURL();          // season options exist now — restore the season choice
    var boot = cols(), legal = (state.sort === 'name' || state.sort === 'age');
    for (var j = 0; j < boot.length; j++) if (boot[j].k === state.sort) legal = true;
    if (!legal) { state.sort = els.pos.value === 'GK' ? 'min' : 'lvl'; state.dir = -1; }
    render();
  }).catch(function () {
    tb.innerHTML = '<tr><td class="empty">The index could not be loaded. ' +
      '<a href="index.json">index.json</a></td></tr>';
  });
})();
