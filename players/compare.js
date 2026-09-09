/* Latent — two-player compare.
   Loads the shared index for the name search, then one small JSON per chosen
   player. Vanilla, no framework, two network calls beyond the index.

   The whole point of this view is the line it refuses to cross: percentile
   bars are drawn ONLY when both selected seasons sit in the same league, the
   same season and the same position group — i.e. the same cohort. Anywhere
   else a percentile comparison is meaningless, so the view falls back to raw
   per-90s and says why. */
(function () {
  'use strict';

  var STATS = [
    ['g90', 'Goals /90', 2, 1], ['a90', 'Assists /90', 2, 1],
    ['shots90', 'Shots /90', 1, 1], ['sot90', 'On target /90', 1, 1],
    ['conversion', 'Conversion', 0, 100], ['shot_acc', 'Shot accuracy', 0, 100],
    ['key_passes90', 'Key passes /90', 1, 1],
    ['prog_carries90', 'Prog. carries /90', 1, 1],
    ['touches90', 'Touches /90', 0, 1], ['long_balls90', 'Long balls /90', 1, 1],
    ['pass_acc', 'Pass accuracy', 0, 100], ['duels90', 'Duels /90', 1, 1],
    ['duel_win_pct', 'Duels won', 0, 100],
    ['recoveries90', 'Recoveries /90', 1, 1], ['clearances90', 'Clearances /90', 1, 1]
  ];
  var LABEL = {}, DP = {}, MUL = {};
  STATS.forEach(function (s) { LABEL[s[0]] = s[1]; DP[s[0]] = s[2]; MUL[s[0]] = s[3]; });

  var POSNAME = { GK: 'goalkeepers', DF: 'defenders', MF: 'midfielders', FW: 'forwards' };

  var out = document.getElementById('cmpout');
  var picked = { a: null, b: null };   // {data, si}
  var INDEX = null;                    // [[slug, name, nat, club], ...]

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmt(k, v) {
    if (v === null || v === undefined) return '—';
    return (v * MUL[k]).toFixed(DP[k]) + (MUL[k] === 100 ? '%' : '');
  }

  // ---- name search over the shared index ---------------------------------
  fetch('index.json').then(function (r) { return r.json(); }).then(function (d) {
    // DB.p is the identity table: [slug, name, pos, age, natIx]. The first row
    // in d.d carrying a player is that player's latest season, so the club we
    // show beside the name is the most recent one on record.
    var club = Object.create(null);
    d.d.forEach(function (r) { if (!(r[0] in club)) club[r[0]] = r[1]; });
    INDEX = d.p.map(function (pl, i) {
      return [pl[0], pl[1], pl[3] < 0 ? '' : d.nats[pl[3]],
              club[i] === undefined || club[i] < 0 ? '' : d.clubs[club[i]], pl[2]];
    });
    INDEX.forEach(function (r) { r.key = (r[1] + ' ' + r[3]).toLowerCase(); });
    var p = new URLSearchParams(location.search);
    ['a', 'b'].forEach(function (side) { if (p.get(side)) choose(side, p.get(side)); });
  });

  function hits(term) {
    var t = term.trim().toLowerCase(), res = [];
    if (t.length < 2 || !INDEX) return res;
    for (var i = 0; i < INDEX.length && res.length < 8; i++) {
      if (INDEX[i].key.indexOf(t) >= 0) res.push(INDEX[i]);
    }
    return res;
  }

  document.querySelectorAll('.cmpside').forEach(function (box) {
    var side = box.getAttribute('data-side');
    var input = box.querySelector('.psearch');
    var list = box.querySelector('.phits');
    input.addEventListener('input', function () {
      var res = hits(input.value);
      list.innerHTML = res.map(function (r) {
        return '<li><button type="button" data-slug="' + r[0] + '" data-side="' + side + '">' +
          '<b>' + esc(r[1]) + '</b><span>' + esc(r[4]) + ' · ' + esc(r[3]) +
          (r[2] ? ' · ' + esc(r[2]) : '') + '</span></button></li>';
      }).join('');
      list.hidden = res.length === 0;
    });
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-slug]');
    if (btn) { choose(btn.getAttribute('data-side'), btn.getAttribute('data-slug')); return; }
    var clr = e.target.closest('[data-clear]');
    if (clr) {
      var s = clr.getAttribute('data-clear');
      picked[s] = null;
      var box = document.querySelector('.cmpside[data-side="' + s + '"]');
      box.querySelector('.pchosen').hidden = true;
      box.querySelector('.psearch').value = '';
      syncURL(); draw();
    }
  });

  document.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-season]');
    if (!sel) return;
    var s = sel.getAttribute('data-season');
    picked[s].si = parseInt(sel.value, 10);
    syncURL(); draw();
  });

  function choose(side, slug) {
    fetch('p/' + encodeURIComponent(slug) + '.json')
      .then(function (r) {
        if (!r.ok) throw new Error('404');
        return r.json();
      })
      .then(function (d) {
        picked[side] = { d: d, si: 0 };
        var box = document.querySelector('.cmpside[data-side="' + side + '"]');
        box.querySelector('.phits').hidden = true;
        box.querySelector('.psearch').value = '';
        var chosen = box.querySelector('.pchosen');
        chosen.innerHTML =
          '<div class="pcard"><div><a class="pcname h3" href="' + d.s + '.html">' +
          esc(d.n) + '</a><span class="label mt2">' + esc(d.pos) + ' · ' + esc(d.club) +
          (d.age ? ' · ' + d.age + ' yrs' : '') + (d.nat ? ' · ' + esc(d.nat) : '') +
          '</span></div><button class="btn btn-ghost btn-sm" type="button" data-clear="' +
          side + '"><span>Clear</span></button></div>' +
          '<label class="field mt4"><span class="field-label">Season</span>' +
          '<select data-season="' + side + '">' +
          d.seasons.map(function (s, i) {
            return '<option value="' + i + '">' + s.lg + ' ' + esc(s.sl) + ' · ' +
              esc(s.club) + ' · ' + s.min.toLocaleString() + ' min</option>';
          }).join('') + '</select></label>';
        chosen.hidden = false;
        syncURL();
        draw();
      })
      .catch(function () {
        out.innerHTML = '<div class="callout callout-warn">' +
          '<span class="callout-title">No profile for that player</span>' +
          'Every profile needs at least one 270-minute season behind it.</div>';
      });
  }

  function syncURL() {
    var p = new URLSearchParams();
    ['a', 'b'].forEach(function (s) { if (picked[s]) p.set(s, picked[s].d.s); });
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  // ---- the comparison ----------------------------------------------------
  function draw() {
    if (!picked.a || !picked.b) {
      out.innerHTML = '<p class="lede">Pick two players to compare.' +
        (picked.a || picked.b ? ' One more to go.' : '') + '</p>';
      return;
    }
    var A = picked.a.d, B = picked.b.d;
    var a = A.seasons[picked.a.si], b = B.seasons[picked.b.si];
    var sameCohort = (a.lg === b.lg && a.sl === b.sl && A.pos === B.pos);

    var h = '<div class="cmphead"><div class="ch a"><span class="chn h3">' + esc(A.n) +
      '</span><span class="label mt2">' + a.lg + ' ' + esc(a.sl) + ' · ' + esc(a.club) +
      '</span></div><div class="chvs label">vs</div>' +
      '<div class="ch b"><span class="chn h3">' + esc(B.n) + '</span>' +
      '<span class="label mt2">' + b.lg + ' ' + esc(b.sl) + ' · ' + esc(b.club) +
      '</span></div></div>';

    // toplines
    var rows = [
      ['Minutes', a.min.toLocaleString(), b.min.toLocaleString(), a.min, b.min],
      ['Apps', a.app, b.app, a.app, b.app],
      ['Starts', a.st, b.st, a.st, b.st]
    ];
    if (a.lvl !== null || b.lvl !== null) {
      rows.push(['Latent Level', a.lvl === null ? '—' : a.lvl.toLocaleString(),
                 b.lvl === null ? '—' : b.lvl.toLocaleString(), a.lvl, b.lvl]);
    }
    if (a.ei !== null || b.ei !== null) {
      rows.push(['Export Index' + (sameCohort ? '' : ' *'),
                 a.ei === null ? '—' : a.ei.toFixed(1),
                 b.ei === null ? '—' : b.ei.toFixed(1),
                 sameCohort ? a.ei : null, sameCohort ? b.ei : null]);
    }
    if (a.rk || b.rk) {
      rows.push(['Rank in league season', a.rk ? '#' + a.rk + ' of ' + a.rkn : '—',
                 b.rk ? '#' + b.rk + ' of ' + b.rkn : '—', null, null]);
    }
    h += '<div class="tbl-wrap"><table class="tbl cmptable"><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="n ' + win(r[3], r[4]) + '">' + r[1] + '</td>' +
          '<th class="tc">' + r[0] + '</th>' +
          '<td class="n ' + win(r[4], r[3]) + '">' + r[2] + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    // cohort verdict — the honest part
    if (sameCohort) {
      h += '<div class="callout mt5"><span class="callout-title">Same cohort — ' +
        'percentiles are comparable</span>Both seasons are ' + a.lg + ' ' + esc(a.sl) +
        ' ' + (POSNAME[A.pos] || 'players') + ', so the bars below rank both players ' +
        'against the same peer group. This is the only situation in which comparing ' +
        'percentiles means anything.</div>';
      h += bars(a, b);
    } else {
      var why = a.lg !== b.lg ? 'different competitions'
        : (a.sl !== b.sl ? 'different seasons of the same competition'
                         : 'different position groups');
      h += '<div class="callout callout-warn mt5"><span class="callout-title">' +
        'Different cohorts — no percentile comparison</span>' +
        'These seasons sit in ' + why + ', so the two players were ranked against ' +
        'different sets of peers. We will not draw a percentile bar across that line, and ' +
        'neither should anyone else. The raw per-90 rates below are directly comparable; ' +
        'the Export Index (marked *) is not.</div>';
      h += rates(a, b);
    }

    h += '<p class="note mt5">Both profiles in full: <a href="' + A.s + '.html">' + esc(A.n) +
      '</a> · <a href="' + B.s + '.html">' + esc(B.n) + '</a>. ' +
      'Per-90 rates divide by the minutes in which each stat was actually collected. ' +
      'A blank means the figure was never collected for that competition-season, ' +
      'not that it was zero.</p>';
    out.innerHTML = h;
    if (window.Latent && window.Latent.motion) window.Latent.motion.refresh(out);
  }

  function win(x, y) {
    if (x === null || y === null || x === undefined || y === undefined) return '';
    return x > y ? 'up' : (x < y ? 'dn' : '');
  }

  function bars(a, b) {
    var h = '<div class="cmpbars mt5">';
    var any = false;
    STATS.forEach(function (s) {
      var k = s[0];
      var pa = a.p[k], pb = b.p[k];
      if (pa === undefined && pb === undefined) return;
      any = true;
      var n = a.coh[k] || b.coh[k] || 0;
      h += '<div class="cbrow" title="' + LABEL[k] + ' — percentile of ' + n + '">' +
        '<span class="cbv num">' + fmt(k, a.v[k]) + '</span>' +
        '<span class="cbt l"><span class="cbf a" style="--w:' +
        (pa === undefined ? 0 : Math.round(pa)) + '%"></span></span>' +
        '<span class="cbp num">' + (pa === undefined ? '—' : Math.round(pa)) + '</span>' +
        '<span class="cbl">' + LABEL[k] + '</span>' +
        '<span class="cbp num">' + (pb === undefined ? '—' : Math.round(pb)) + '</span>' +
        '<span class="cbt r"><span class="cbf b" style="--w:' +
        (pb === undefined ? 0 : Math.round(pb)) + '%"></span></span>' +
        '<span class="cbv num">' + fmt(k, b.v[k]) + '</span></div>';
    });
    if (!any) return '<div class="callout callout-warn mt5"><span class="callout-title">' +
      'Nothing to draw</span>No percentile was published for either season — the position ' +
      'cohort did not reach the 10-player floor.</div>';
    return h + '</div><p class="note mt3">Bars are percentiles within ' +
      esc(a.lg) + ' ' + esc(a.sl) + ' only, dark for the left player and sky for the ' +
      'right. The figures on the outside are the raw rates; cohort size is on hover.</p>';
  }

  function rates(a, b) {
    var h = '<div class="tbl-wrap mt5"><table class="tbl cmptable"><tbody>';
    var any = false;
    STATS.forEach(function (s) {
      var k = s[0];
      var va = a.v[k], vb = b.v[k];
      if ((va === null || va === undefined) && (vb === null || vb === undefined)) return;
      any = true;
      h += '<tr><td class="n ' + win(va, vb) + '">' + fmt(k, va) + '</td>' +
        '<th class="tc">' + LABEL[k] + '</th>' +
        '<td class="n ' + win(vb, va) + '">' + fmt(k, vb) + '</td></tr>';
    });
    if (!any) return '<p class="note mt5">Neither season has a published rate to compare.</p>';
    return h + '</tbody></table></div>';
  }

  draw();
})();
