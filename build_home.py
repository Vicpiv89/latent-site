#!/usr/bin/env python3
"""Regenerate the data-driven regions of site/index.html from shared/scout.db.

Usage:  python3 site/build_home.py        (from repo root, or anywhere)

Rewrites the content between gen:* marker comments in index.html — the stat
strip, the hero player card, the per-league Export Index top-5 tables and the
browse-all count — so the homepage can never go stale by hand again.

Read-only consumer of the DB. Rules enforced here (see WARNINGS.md):
- goalkeepers never appear in an Export Index leaderboard
- percentiles/index are shown per league+season only, never across leagues
- ball-carry figures only for the whitelisted league-seasons
- no league tables (standings) anywhere
"""
import re
import sqlite3
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "shared" / "scout.db"
INDEX = ROOT / "site" / "index.html"
TODAY = date.today()
MIN_MINUTES = 270

# league-seasons where ball-carry data is actually collected (WARNINGS.md)
CARRY_OK = {("CPL", "2026"), ("EKS", "25/26"), ("EKS", "26/27"), ("USLC", "2026")}

POS_GROUP = {"GK": "goalkeepers", "DF": "defenders", "MF": "midfielders", "FW": "forwards"}

HERO_STATS = [
    ("Goals /90", "g90", "pctl_g90", "{:.2f}"),
    ("Assists /90", "a90", "pctl_a90", "{:.2f}"),
    ("Key passes /90", "key_passes90", "pctl_key_passes90", "{:.1f}"),
    ("Shots /90", "shots90", "pctl_shots90", "{:.1f}"),
    ("Prog. carries /90", "prog_carries90", "pctl_prog_carries90", "{:.1f}"),
    ("Pass accuracy", "pass_acc", "pctl_pass_acc", "{:.0%}"),
    ("Duels won", "duel_win_pct", "pctl_duel_win", "{:.0%}"),
]


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def age_of(birth_date):
    if not birth_date:
        return None
    b = date.fromisoformat(birth_date[:10])
    return (TODAY - b).days // 365


def replace_region(html, name, content):
    pat = re.compile(rf"(<!-- gen:{name}:start[^>]*-->)(.*?)(<!-- gen:{name}:end -->)",
                     re.S)
    if not pat.search(html):
        raise SystemExit(f"marker gen:{name} not found in {INDEX}")
    return pat.sub(lambda m: m.group(1) + "\n" + content + "\n    " + m.group(3), html)


def build():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    one = lambda q: cur.execute(q).fetchone()[0]

    n_stat_rows = one("SELECT COUNT(*) FROM player_match_stats")
    n_matches = one("SELECT COUNT(*) FROM matches")
    n_players = one("SELECT COUNT(*) FROM players")
    n_rankable = one(f"SELECT COUNT(DISTINCT player_id) FROM player_season WHERE minutes >= {MIN_MINUTES}")
    n_leagues = one("SELECT COUNT(*) FROM leagues")

    # ---- stat strip ----
    strip = "\n".join(
        f'    <div><div class="big num">{v}</div><div class="cap">{c}</div></div>'
        for v, c in [
            (f"{n_stat_rows:,}", "Player-match stat lines"),
            (f"{n_matches:,}", "Matches tracked"),
            (f"{n_players:,}", f"Players across {n_leagues} leagues"),
            ("&lt;24h", "Refresh after full time"),
        ])

    # ---- top 5 per league, goalkeepers excluded ----
    # latest season per league with a rankable pool — a current season two
    # matchdays old has nobody past 270 minutes yet and must not drop the league
    top_q = f"""
        SELECT p.name, p.birth_date, p.position, ps.export_index AS ei,
               c.name AS club, l.code AS lg, s.label AS season,
               s.sofascore_season_id AS sid
        FROM player_season ps
        JOIN players p ON p.id = ps.player_id
        JOIN clubs c ON c.id = ps.club_id
        JOIN seasons s ON s.id = ps.season_id
        JOIN leagues l ON l.id = s.league_id
        WHERE ps.minutes >= {MIN_MINUTES}
          AND ps.export_index IS NOT NULL AND p.position != 'GK'
        ORDER BY ps.export_index DESC
    """
    pools = {}  # (lg, sid) -> rows, already sorted by index desc
    for r in cur.execute(top_q):
        pools.setdefault((r["lg"], r["sid"]), []).append(r)
    by_league = {}
    for (lg, sid), rows in pools.items():
        if len(rows) < 5:
            continue
        if lg not in by_league or sid > by_league[lg][0]["sid"]:
            by_league[lg] = rows
    # deepest current-season pool first — a data ordering, not a branding one
    order = sorted(by_league, key=lambda lg: -len(by_league[lg]))

    tables = []
    for lg in order:
        rows = ""
        for i, r in enumerate(by_league[lg][:5], 1):
            a = age_of(r["birth_date"])
            sub = " · ".join(x for x in [esc(r["club"]), r["position"] or "", str(a) if a else ""] if x)
            rows += (f'          <tr><td class="rk num">{i:02d}</td>'
                     f'<td class="pl">{esc(r["name"])}<span class="sub">{sub}</span></td>'
                     f'<td class="ix num">{r["ei"]:.1f}</td></tr>\n')
        tables.append(
            f'      <table class="index-table">\n'
            f'        <caption>{lg} <span class="num">{esc(by_league[lg][0]["season"])} · top 5'
            f'</span></caption>\n        <tbody>\n{rows}        </tbody>\n      </table>')
    tables_html = "\n".join(tables)

    # ---- hero card: highest current-season index, non-GK ----
    h = cur.execute(f"""
        SELECT p.name, p.birth_date, p.position, ps.*, c.name AS club,
               l.code AS lg, s.label AS season
        FROM player_season ps
        JOIN players p ON p.id = ps.player_id
        JOIN clubs c ON c.id = ps.club_id
        JOIN seasons s ON s.id = ps.season_id
        JOIN leagues l ON l.id = s.league_id
        WHERE s.is_current = 1 AND ps.minutes >= {MIN_MINUTES}
          AND ps.export_index IS NOT NULL AND p.position != 'GK'
        ORDER BY ps.export_index DESC LIMIT 1""").fetchone()

    bars = ""
    shown = 0
    for lbl, col, pc, f in HERO_STATS:
        if shown >= 6:
            break
        if col == "prog_carries90" and (h["lg"], h["season"]) not in CARRY_OK:
            continue
        if h[pc] is None or h[col] is None:
            continue
        p = round(h[pc])
        cls = "fill" if p >= 60 else "fill soft"
        bars += (f'        <div class="statrow"><span class="lbl">{lbl}</span>'
                 f'<span class="val num">{f.format(h[col])}</span>\n'
                 f'          <span class="track"><span class="{cls}" style="--w:{p}%">'
                 f'</span></span><span class="pct num">{p}</span></div>\n')
        shown += 1

    a = age_of(h["birth_date"])
    age_bit = f'{a} yrs · ' if a else ""
    group = POS_GROUP.get(h["position"], "players")
    hero = (
        f'      <div class="postcard" aria-label="Sample player card: {esc(h["name"])}">\n'
        f'        <p class="eyebrow">{h["lg"]} · {esc(h["club"])} · {esc(h["season"])}</p>\n'
        f'        <h3>{esc(h["name"])}</h3>\n'
        f'        <p class="meta">{h["position"]} · {age_bit}<span class="num">{h["minutes"]:,}'
        f'</span> min · <span class="num">{h["matches_played"]}</span> apps</p>\n'
        f'{bars}'
        f'        <div class="foot"><span>Percentile vs. {h["lg"]} {group}, '
        f'{esc(h["season"])}</span><span class="mark">Latent</span></div>\n'
        f'      </div>')

    browse = (f'    <p style="margin-top:20px"><a class="btn btn-ghost" href="players/index.html">'
              f'Browse all {n_rankable:,} player profiles</a></p>')

    con.close()

    html = INDEX.read_text()
    html = replace_region(html, "strip", strip)
    html = replace_region(html, "tables", tables_html)
    html = replace_region(html, "hero", hero)
    html = replace_region(html, "browse", browse)
    INDEX.write_text(html)
    print(f"index.html regenerated: {n_stat_rows:,} stat rows / {n_matches:,} matches / "
          f"{n_players:,} players / {n_rankable:,} profiles / {len(order)} league tables "
          f"(hero: {h['name']}, {h['lg']} {h['season']})")


if __name__ == "__main__":
    build()
