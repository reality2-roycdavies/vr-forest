#!/usr/bin/env python3
"""Generate the Spec Confidence dashboard with Popperian refutation model.

VR Endless Forest edition — forest green theme, WebXR-adapted columns.

UI follows calm computing principles: the grid shows the aftermath
(solid vs thin/faded dots), not the attack. All rich refutation data
lives in the detail panel.
"""

import json
import os
from datetime import datetime

from spec_state import build_state, COLUMNS, REFUTATION_TYPES, SEVERITY_LEVELS

OUTPUT = os.path.join(os.path.dirname(__file__), 'index.html')


def esc(text):
    return (str(text)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;'))


def confidence_color(score):
    if score <= 0.0:
        return 'hsl(220,10%,85%)'
    if score <= 0.5:
        t = score / 0.5
        h = 220 + (45 - 220) * t
        s = 10 + (90 - 10) * t
        l = 85 + (55 - 85) * t
        return f'hsl({h:.0f},{s:.0f}%,{l:.0f}%)'
    t = (score - 0.5) / 0.5
    h = 45 + (142 - 45) * t
    s = 90 + (70 - 90) * t
    l = 55 + (50 - 55) * t
    return f'hsl({h:.0f},{s:.0f}%,{l:.0f}%)'


def build_table_rows(spec_data, ordered_cats, descriptions=None):
    descriptions = descriptions or {}
    rows = ''
    for cat, codes in ordered_cats:
        rows += f'''\
        <tr class="cat-row">
          <td class="cat-label" colspan="8">{esc(cat)} ({len(codes)})</td>
        </tr>'''
        for code in codes:
            sd = spec_data[code]
            frontier_marker = '<span class="frontier-marker">▶</span>' if sd['frontier'] else ''
            inherited = sd.get('inherited_drops', [])
            drop_marker = '<span class="drop-marker" title="Inherited confidence drop from dependency">⚠</span>' if inherited else ''
            is_stale_spec = sd.get('spec_modified_since_review', False)
            desc = descriptions.get(code, {})
            desc_title = esc(desc.get('title', code))
            desc_text = esc(desc.get('conjecture', ''))

            cells_html = ''
            evidence_staleness = sd.get('evidence_staleness', {})
            for col in COLUMNS:
                score = sd['cells'].get(col['id'], 0.0)
                is_stale = evidence_staleness.get(col['id'], False)
                size = 8 + score * 16
                opacity = '0.35' if is_stale and score > 0 else '1.0'
                cells_html += (
                    f'<td class="grid-cell" data-spec="{esc(code)}" data-col="{col["id"]}" data-score="{score}" data-stale="{str(is_stale).lower()}">'
                    f'<div class="dot" style="width:{size:.1f}px;height:{size:.1f}px;background:{confidence_color(score)};opacity:{opacity}" '
                    f'title="{col["label"]}: {score*100:.0f}%"></div>'
                    '</td>'
                )
            rows += f'''\
        <tr class="spec-row" data-spec="{esc(code)}" data-downstream="{sd['downstream']}" data-confidence="{sd['confidence']}" data-frontier="{str(sd['frontier']).lower()}" data-inherited-drops="{len(inherited)}" data-stale="{str(is_stale_spec).lower()}">
          <td class="spec-marker">{frontier_marker}{drop_marker}</td>
          <td class="spec-name" data-spec="{esc(code)}" data-title="{desc_title}" data-desc="{desc_text}">{esc(code)}</td>
          {cells_html}
        </tr>'''
    return rows


def build_headers():
    headers = ''
    for col in COLUMNS:
        conj = esc(col.get('conjecture', ''))
        headers += f'<th class="col-header" data-col="{col["id"]}" data-label="{esc(col["label"])}" data-conjecture="{conj}"><span class="col-icon">{col["icon"]}</span>{col["label"]}</th>'
    return headers


def compute_freshness(spec_data):
    """Count specs that have any fresh (non-stale) evidence."""
    total_with_evidence = 0
    fresh_count = 0
    for sd in spec_data.values():
        staleness = sd.get('evidence_staleness', {})
        has_evidence = any(
            sd.get('cells', {}).get(col_id, 0) > 0
            for col_id in ['reviewed', 'test_spec', 'built', 'testing', 'integrated', 'field']
        )
        if not has_evidence:
            continue
        total_with_evidence += 1
        has_fresh = any(
            sd.get('cells', {}).get(col_id, 0) > 0 and not staleness.get(col_id, False)
            for col_id in ['reviewed', 'test_spec', 'built', 'testing', 'integrated', 'field']
        )
        if has_fresh:
            fresh_count += 1
    return fresh_count, total_with_evidence


def load_descriptions():
    """Load spec conjecture descriptions for popups."""
    desc_path = os.path.join(os.path.dirname(__file__), 'spec-meta', 'descriptions.json')
    if os.path.exists(desc_path):
        return json.load(open(desc_path))
    return {}


def main():
    state = build_state()
    spec_data = state['spec_data']
    ordered_cats = state['categories']
    summary = state['summary']
    reviewer_options = state.get('reviewers', [])
    descriptions = load_descriptions()

    fresh_count, evidence_count = compute_freshness(spec_data)

    now = datetime.now().strftime('%Y-%m-%d %H:%M')
    table_rows = build_table_rows(spec_data, ordered_cats, descriptions)
    headers = build_headers()

    # Load app.js for inline embedding
    app_js_path = os.path.join(os.path.dirname(__file__), 'app.js')
    with open(app_js_path, 'r') as f:
        app_js = f.read()

    html = f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>🌲</text></svg>">
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>VR Endless Forest — Specification Dashboard</title>
<style>
:root {{
  --bg: #0b120e; --surface: #141f18; --surface2: #1c2b22; --surface3: #25382c;
  --border: #2d4636; --text: #e8f0ea; --text2: #9db5a5; --text3: #6a8575;
  --accent: #4ade80; --frontier: #4ade80; --done: #22c55e; --warn: #facc15;
  --stale-text: #d4a054; --survived: #22c55e;
}}
@media (prefers-color-scheme: light) {{
  :root {{
    --bg: #f5faf6; --surface: #ffffff; --surface2: #eef5f0; --surface3: #dceade;
    --border: #bdd4c2; --text: #0f2318; --text2: #3d5c48; --text3: #6a8575;
    --accent: #16a34a; --frontier: #16a34a; --done: #15803d; --warn: #f97316;
    --stale-text: #b8860b; --survived: #15803d;
  }}
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg); color: var(--text); min-height: 100vh; padding: 1.5rem;
}}
.page {{ max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }}
.page-header {{ display: flex; flex-direction: column; gap: 0.75rem; }}
.header-top {{ display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-start; }}
.header-actions {{ display: flex; align-items: center; gap: 0.5rem; }}
.queue-btn {{ border: 1px solid var(--accent); background: rgba(74,222,128,0.15); color: var(--accent); border-radius: 999px; padding: 0.4rem 0.9rem; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; }}
.queue-btn:hover {{ background: var(--accent); color: var(--bg); }}
.queue-count {{ background: var(--surface); border: 1px solid var(--accent); border-radius: 999px; padding: 0.05rem 0.6rem; font-size: 0.75rem; color: var(--accent); }}
.page-header h1 {{ font-size: 1.4rem; margin: 0; }}
.subtitle {{ color: var(--text3); font-size: 0.85rem; }}
.progress-row {{
  display: flex; align-items: center; gap: 0.75rem; font-size: 0.85rem;
  color: var(--text2);
}}
.progress-bar {{ flex: 1; height: 8px; border-radius: 999px; background: var(--surface2); overflow: hidden; }}
.progress-fill {{ height: 100%; border-radius: 999px; background: linear-gradient(90deg,#f59e0b,#22c55e); transition: width 0.3s; }}
.freshness {{ color: var(--text3); font-size: 0.8rem; }}
.insights-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }}
.insight-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem; min-height: 120px; display: flex; flex-direction: column; gap: 0.4rem; }}
.insight-label {{ font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); }}
.insight-list {{ list-style: decimal-leading-zero inside; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.82rem; }}
.insight-list button {{ background: none; border: none; color: var(--accent); cursor: pointer; font: inherit; padding: 0; }}
.layout {{ display: flex; gap: 1rem; align-items: flex-start; }}
.table-wrap {{ flex: 1; overflow-x: auto; }}
table {{ width: 100%; border-collapse: separate; border-spacing: 2px; font-size: 0.8rem; min-width: 720px; }}
th {{ text-align: center; padding: 0.35rem 0.25rem; color: var(--text3); font-weight: 500; font-size: 0.72rem; }}
th .col-icon {{ display: block; font-size: 0.9rem; }}
.cat-row td {{ font-weight: 600; color: var(--text2); padding: 0.6rem 0.3rem 0.3rem; border-bottom: 1px solid var(--border); }}
.spec-marker {{ width: 28px; color: var(--frontier); text-align: center; white-space: nowrap; }}
.drop-marker {{ color: #f59e0b; font-size: 0.85rem; margin-left: 1px; cursor: help; }}
.spec-name {{ cursor: pointer; font-family: 'JetBrains Mono','SFMono-Regular',monospace; white-space: nowrap; transition: color 0.3s; }}
.spec-name:hover {{ color: var(--accent); }}
.spec-row[data-stale="true"] .spec-name {{ color: var(--stale-text); }}
.spec-row[data-stale="true"] .spec-name:hover {{ color: var(--accent); }}
.conjecture-popup {{
  position: fixed; z-index: 100;
  background: var(--surface); border: 1px solid var(--accent);
  border-radius: 10px; padding: 0.75rem 1rem;
  max-width: 420px; min-width: 280px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.35);
  pointer-events: none; opacity: 0;
  transition: opacity 0.15s;
  font-size: 0.82rem;
}}
.conjecture-popup.visible {{ opacity: 1; pointer-events: auto; }}
.conjecture-popup h4 {{ margin: 0 0 0.35rem; font-size: 0.85rem; color: var(--accent); }}
.conjecture-popup p {{ margin: 0; color: var(--text2); line-height: 1.45; }}
.grid-cell {{ width: 46px; height: 36px; text-align: center; cursor: pointer; }}
.dot {{ border-radius: 50%; display: inline-block; transition: transform 0.2s, box-shadow 0.2s, opacity 0.4s, width 0.3s, height 0.3s; }}
.grid-cell:hover .dot {{ transform: scale(1.35); box-shadow: 0 0 0 2px var(--accent); }}

#detail {{ width: 380px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto; display: flex; flex-direction: column; gap: 0.8rem; }}
#detail.panel-empty {{ align-items: center; justify-content: center; color: var(--text3); text-align: center; }}
.panel-header {{ display: flex; justify-content: space-between; gap: 0.5rem; align-items: flex-start; }}
.panel-header h2 {{ margin: 0; font-size: 1.05rem; }}
.panel-meta {{ color: var(--text3); font-size: 0.78rem; }}
.panel-actions {{ display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }}
.repo-link {{ color: var(--accent); text-decoration: none; font-size: 0.78rem; border: 1px solid var(--accent); border-radius: 6px; padding: 0.18rem 0.55rem; margin-right: 0.3rem; }}
.repo-link:hover {{ background: var(--accent); color: #fff; }}
.close-btn {{ background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--text2); cursor: pointer; font-size: 0.9rem; padding: 0.15rem 0.4rem; }}
.section-title {{ font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); margin-bottom: 0.3rem; }}

.staleness-timeline {{ display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text3); padding: 0.4rem 0; }}
.staleness-timeline .dot-fresh {{ width: 8px; height: 8px; border-radius: 50%; background: var(--done); display: inline-block; }}
.staleness-timeline .dot-stale {{ width: 8px; height: 8px; border-radius: 50%; background: var(--stale-text); opacity: 0.6; display: inline-block; }}

.breadth-card {{ background: var(--surface2); border: 1px solid var(--surface3); border-radius: 8px; padding: 0.5rem; }}
.breadth-summary {{ font-size: 0.82rem; margin-bottom: 0.3rem; }}
.breadth-bar {{ display: flex; gap: 3px; }}
.breadth-segment {{ flex: 1; height: 6px; border-radius: 3px; background: var(--surface3); transition: background 0.3s; }}
.breadth-segment.fresh {{ background: var(--survived); }}
.breadth-segment.stale {{ background: var(--stale-text); opacity: 0.45; }}
.breadth-types {{ font-size: 0.72rem; color: var(--text3); margin-top: 0.3rem; }}

.reviewer-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.4rem; }}
.reviewer-card {{ border: 1px solid var(--surface3); border-radius: 8px; padding: 0.5rem; background: var(--surface2); display: flex; flex-direction: column; gap: 0.35rem; }}
.reviewer-card.approved {{ border-color: rgba(34,197,94,0.5); }}
.reviewer-card.pending {{ border-color: var(--border); }}
.reviewer-card.unassigned {{ border-style: dashed; color: var(--text3); }}
.reviewer-name {{ font-weight: 600; font-size: 0.9rem; }}
.reviewer-status {{ font-size: 0.72rem; color: var(--text3); }}
.reviewer-card-btn {{ margin-top: auto; align-self: flex-start; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text2); font-size: 0.72rem; padding: 0.2rem 0.45rem; cursor: pointer; }}
.reviewer-card-btn:hover {{ border-color: var(--accent); color: var(--accent); }}
.dep-graph-card {{ background: var(--surface2); border: 1px solid var(--surface3); border-radius: 10px; padding: 0.5rem; }}
.dep-graph-card svg {{ width: 100%; height: 220px; }}
.dep-label {{ font-size: 0.7rem; fill: var(--text2); text-anchor: middle; }}
.evidence-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.45rem; }}
.ev-card {{ background: var(--surface2); border: 1px solid var(--surface3); border-radius: 8px; padding: 0.5rem; transition: opacity 0.3s; }}
.ev-card.ev-stale {{ opacity: 0.55; }}
.ev-card strong {{ display: block; font-size: 0.78rem; margin-bottom: 0.3rem; }}
.ev-card label {{ display: block; font-size: 0.76rem; margin: 0.2rem 0; cursor: pointer; }}
.ev-card input {{ margin-right: 0.25rem; }}
.dep-list {{ font-size: 0.78rem; color: var(--text2); }}
.review-history, .issue-list {{ font-size: 0.75rem; }}
.review-history {{ display: flex; flex-direction: column; gap: 0.5rem; }}
.review-entry {{ background: var(--surface2); border: 1px solid var(--surface3); border-radius: 8px; padding: 0.5rem; transition: opacity 0.3s; }}
.review-entry.stale-entry {{ opacity: 0.5; }}
.review-entry-header {{ display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; font-size: 0.78rem; flex-wrap: wrap; }}
.review-entry-status {{ border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.7rem; border: 1px solid var(--border); }}
.review-entry-status.approved, .review-entry-status.survived {{ border-color: rgba(34,197,94,0.5); color: var(--done); }}
.review-entry-status.needs-changes {{ border-color: #f97316; color: #f97316; }}
.review-entry-status.rejected, .review-entry-status.falsified {{ border-color: #ef4444; color: #ef4444; }}
.review-entry-note {{ font-size: 0.76rem; color: var(--text2); margin-top: 0.3rem; }}
.review-entry-diff {{ font-size: 0.72rem; color: var(--text3); margin-top: 0.2rem; font-family: monospace; }}
.review-entry-badges {{ display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.2rem; }}
.badge {{ display: inline-block; border-radius: 4px; padding: 0.05rem 0.35rem; font-size: 0.65rem; }}
.badge-type {{ background: var(--surface3); color: var(--text2); border: 1px solid var(--border); }}
.badge-severity {{ text-transform: uppercase; letter-spacing: 0.04em; }}
.badge-casual {{ background: rgba(74,222,128,0.12); color: var(--accent); border: 1px solid rgba(74,222,128,0.25); }}
.badge-thorough {{ background: rgba(34,197,94,0.12); color: var(--done); border: 1px solid rgba(34,197,94,0.25); }}
.badge-hostile {{ background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.25); }}
.badge-competing_models {{ background: rgba(168,85,247,0.12); color: #a855f7; border: 1px solid rgba(168,85,247,0.25); }}
.badge-real_world {{ background: rgba(212,160,84,0.12); color: var(--stale-text); border: 1px solid rgba(212,160,84,0.25); }}
.inherited-drop-alert {{ background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.35); border-radius: 8px; padding: 0.5rem; font-size: 0.78rem; color: #f59e0b; }}
.inherited-drop-alert strong {{ display: block; margin-bottom: 0.2rem; }}
.inherited-drop-list {{ margin: 0.2rem 0 0; padding: 0 0 0 1.2rem; font-size: 0.75rem; }}
.issue-open {{ color: #f87171; }}
.issue-resolved {{ color: var(--done); text-decoration: line-through; }}
.legend {{ display: flex; gap: 1rem; flex-wrap: wrap; color: var(--text3); font-size: 0.75rem; align-items: center; }}
.legend .legend-dot {{ border-radius: 50%; display: inline-block; }}

.modal-backdrop {{ position: fixed; inset: 0; background: rgba(11,18,14,0.72); display: none; align-items: center; justify-content: center; padding: 1rem; z-index: 50; }}
.modal-backdrop.visible {{ display: flex; }}
.modal-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 12px; width: min(640px, 100%); max-height: calc(100vh - 2rem); overflow-y: auto; padding: 1rem; box-shadow: 0 25px 50px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 0.75rem; }}
.modal-card.review-modal {{ width: min(560px, 100%); }}
.modal-header {{ display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }}
.modal-header h3 {{ margin: 0; font-size: 1rem; }}
.modal-close {{ background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--text2); cursor: pointer; padding: 0.25rem 0.6rem; }}
.queue-list {{ display: flex; flex-direction: column; gap: 0.5rem; }}
.queue-entry {{ border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem; background: var(--surface2); display: flex; flex-direction: column; gap: 0.4rem; }}
.queue-entry-head {{ display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; font-size: 0.9rem; }}
.queue-entry-meta {{ display: flex; flex-wrap: wrap; gap: 0.6rem; font-size: 0.78rem; color: var(--text3); }}
.queue-status {{ border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.72rem; border: 1px solid var(--border); }}
.queue-status--pending {{ border-color: var(--border); color: var(--text2); }}
.queue-status--unassigned {{ border-color: var(--warn); color: var(--warn); }}
.queue-status--needs {{ border-color: #f97316; color: #f97316; }}
.queue-status--rejected {{ border-color: #ef4444; color: #ef4444; }}
.queue-entry-actions {{ display: flex; gap: 0.5rem; flex-wrap: wrap; }}
.queue-empty {{ text-align: center; color: var(--text3); margin: 1.2rem 0; }}
.queue-note {{ font-size: 0.78rem; color: var(--text2); }}
.queue-unassigned {{ color: var(--warn); }}

.btn {{ background: var(--accent); color: #0b120e; border: none; border-radius: 8px; padding: 0.4rem 0.9rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; }}
.btn-secondary {{ background: transparent; border: 1px solid var(--border); color: var(--text2); border-radius: 8px; padding: 0.4rem 0.9rem; cursor: pointer; font-size: 0.85rem; }}
.hidden {{ display: none !important; }}
.review-dialog {{ display: flex; flex-direction: column; gap: 0.75rem; }}
.review-field {{ display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }}
.review-field label {{ font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text3); }}
.review-dialog select,
.review-dialog textarea,
.review-dialog input[type="text"] {{ width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0.5rem; color: var(--text); font: inherit; }}
.review-dialog textarea {{ resize: vertical; min-height: 90px; }}
.review-status-options {{ display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.85rem; }}
.review-status-options label {{ text-transform: none; letter-spacing: normal; color: var(--text2); font-size: 0.85rem; }}
.review-meta {{ font-size: 0.82rem; color: var(--text2); }}
.review-actions {{ display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }}
.review-actions .spacer {{ flex: 1; }}

#toast {{ position: fixed; bottom: 1.2rem; right: 1.2rem; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 0.45rem 0.9rem; font-size: 0.8rem; opacity: 0; pointer-events: none; transition: opacity 0.2s, transform 0.2s; transform: translateY(10px); }}
#toast.visible {{ opacity: 1; transform: translateY(0); }}
#cmd-panel {{ position: fixed; left: 0; right: 0; bottom: 0; background: var(--surface3); color: #fff; padding: 0.65rem 1rem; display: none; gap: 0.75rem; align-items: center; }}
#cmd-panel.visible {{ display: flex; }}
#cmd-panel pre {{ flex: 1; margin: 0; font-size: 0.75rem; white-space: pre-wrap; }}
#cmd-panel button {{ background: var(--accent); color: #0b120e; border: none; border-radius: 6px; padding: 0.35rem 0.9rem; cursor: pointer; }}
#cmd-panel .btn-dismiss {{ background: transparent; border: 1px solid rgba(255,255,255,0.4); color: #fff; }}

@media (max-width: 1100px) {{
  .layout {{ flex-direction: column; }}
  #detail {{ width: 100%; position: static; max-height: none; }}
}}
</style>
</head>
<body>
<div class=\"page\">
  <header class=\"page-header\">
    <div class=\"header-top\">
      <div>
        <h1>VR Endless Forest — Specification Confidence</h1>
        <p class=\"subtitle\">{summary['total']} specs · {esc(now)}</p>
      </div>
      <div class=\"header-actions\">
        <button id=\"queue-button\" class=\"queue-btn\">Review queue <span id=\"queue-count\" class=\"queue-count\">0</span></button>
      </div>
    </div>
    <div class=\"progress-row\">
      <div class=\"progress-bar\"><div class=\"progress-fill\" id=\"progress-fill\" style=\"width:{summary['avg']*100:.1f}%\"></div></div>
      <span><strong id=\"summary-avg\">{summary['avg']*100:.0f}%</strong></span>
      <span><span id=\"summary-done\">{summary['done']}</span>/{summary['total']} active</span>
      <span><span id=\"summary-ready\">{summary['frontier']}</span> ready</span>
      <span class=\"freshness\"><span id=\"summary-fresh\">{fresh_count}</span>/<span id=\"summary-evidence\">{evidence_count}</span> fresh</span>
    </div>
    <div class=\"insights-grid\">
      <div class=\"insight-card\">
        <div class=\"insight-label\">Highest downstream impact</div>
        <ol class=\"insight-list\" id=\"impact-list\"></ol>
      </div>
      <div class=\"insight-card\">
        <div class=\"insight-label\">Most blocked by deps</div>
        <ol class=\"insight-list\" id=\"blocked-list\"></ol>
      </div>
      <div class=\"insight-card\">
        <div class=\"insight-label\">Ready to work</div>
        <ol class=\"insight-list\" id=\"ready-list\"></ol>
      </div>
    </div>
  </header>

  <div class=\"layout\">
    <div class=\"table-wrap\">
      <table class=\"grid-table\">
        <thead>
          <tr>
            <th></th>
            <th style=\"text-align:left\">Spec</th>
            {headers}
          </tr>
        </thead>
        <tbody>
          {table_rows}
        </tbody>
      </table>
      <div class=\"legend\">
        <div><span class=\"legend-dot\" style=\"width:8px;height:8px;background:hsl(220,10%,85%)\"></span> Untested</div>
        <div><span class=\"legend-dot\" style=\"width:12px;height:12px;background:hsl(45,80%,60%)\"></span> Emerging</div>
        <div><span class=\"legend-dot\" style=\"width:18px;height:18px;background:hsl(90,60%,50%)\"></span> Survived</div>
        <div><span class=\"legend-dot\" style=\"width:24px;height:24px;background:hsl(142,70%,50%)\"></span> Battle-tested</div>
        <div><span class=\"legend-dot\" style=\"width:12px;height:12px;background:hsl(45,80%,60%);opacity:0.35\"></span> Still setting</div>
        <div><span style=\"color:var(--frontier);font-weight:700\">▶</span> Ready to work</div>
        <div><span style=\"color:#f59e0b;font-weight:700\">⚠</span> Inherited drop</div>
      </div>
    </div>

    <aside id=\"detail\" class=\"panel-empty\">
      <div id=\"detail-placeholder\">
        <p class=\"subtitle\">Select a spec to inspect refutation history, dependency graph, and evidence.</p>
      </div>
      <div id=\"detail-content\" hidden></div>
    </aside>
  </div>
</div>

<div id=\"queue-modal\" class=\"modal-backdrop\" aria-hidden=\"true\">
  <div class=\"modal-card queue-modal\">
    <div class=\"modal-header\">
      <h3>Review queue</h3>
      <button class=\"modal-close\" id=\"queue-close\">Close</button>
    </div>
    <p class=\"subtitle\">Slots that still need reviewers or sign-off bubble up here, sorted by downstream impact.</p>
    <div id=\"queue-list\" class=\"queue-list\"></div>
  </div>
</div>

<div id=\"review-modal\" class=\"modal-backdrop\" aria-hidden=\"true\">
  <div class=\"modal-card review-modal\">
    <div class=\"modal-header\">
      <h3 id=\"review-modal-title\">Log refutation attempt</h3>
      <button class=\"modal-close\" id=\"review-cancel\">Close</button>
    </div>
    <div class=\"review-dialog\">
      <div class=\"review-field\">
        <label>Spec</label>
        <div id=\"review-spec\"></div>
      </div>
      <div class=\"review-field\">
        <label>Slot</label>
        <div id=\"review-slot\"></div>
      </div>
      <div class=\"review-field\">
        <label>Refutation type</label>
        <select id=\"refutation-type\">
          <option value=\"peer_review\">Peer review</option>
          <option value=\"adversarial_vectors\">Adversarial test vectors</option>
          <option value=\"dual_model_audit\">Dual-model audit</option>
          <option value=\"implementation_test\">Implementation test</option>
          <option value=\"integration_test\">Integration test</option>
          <option value=\"field_deployment\">VR field deployment</option>
        </select>
      </div>
      <div class=\"review-field\">
        <label>Severity</label>
        <select id=\"refutation-severity\">
          <option value=\"casual\">Casual</option>
          <option value=\"thorough\">Thorough</option>
          <option value=\"hostile\">Hostile</option>
          <option value=\"competing_models\">Competing models</option>
          <option value=\"real_world\">Real-world</option>
        </select>
      </div>
      <div class=\"review-field\">
        <label>Assignment</label>
        <div>
          <select id=\"reviewer-select\"></select>
          <input id=\"reviewer-custom\" type=\"text\" class=\"hidden\" placeholder=\"Custom reviewer name\">
        </div>
      </div>
      <div class=\"review-field review-meta\">
        <label>Current status</label>
        <div id=\"review-meta\"></div>
      </div>
      <div class=\"review-field\">
        <label>Outcome</label>
        <div class=\"review-status-options\">
          <label><input type=\"radio\" name=\"review-status\" value=\"approved\" id=\"review-status-approved\" checked> Survived</label>
          <label><input type=\"radio\" name=\"review-status\" value=\"needs-changes\"> Needs changes</label>
          <label><input type=\"radio\" name=\"review-status\" value=\"rejected\"> Falsified</label>
        </div>
      </div>
      <div class=\"review-field\">
        <label>Note / Falsification details</label>
        <textarea id=\"review-note\" rows=\"3\" placeholder=\"What was attempted? If falsified, what broke?\"></textarea>
      </div>
      <div class=\"review-actions\">
        <button type=\"button\" class=\"btn-secondary\" id=\"review-save-assignment\">Save assignment</button>
        <span class=\"spacer\"></span>
        <button type=\"button\" class=\"btn\" id=\"review-submit\">Submit</button>
      </div>
    </div>
  </div>
</div>

<div id=\"conjecture-popup\" class=\"conjecture-popup\"><h4></h4><p></p></div>

<div id=\"toast\"></div>
<div id=\"cmd-panel\">
  <pre id=\"cmd-text\"></pre>
  <button class=\"btn-copy\" onclick=\"copyCmd(event)\">Copy</button>
  <button class=\"btn-dismiss\" onclick=\"dismissCmdPanel()\">✕</button>
</div>

<script>
window.__SPEC_DATA__ = {json.dumps(spec_data)};
window.__COLUMNS__ = {json.dumps(COLUMNS)};
window.__REVIEWER_OPTIONS__ = {json.dumps(reviewer_options)};
window.__REFUTATION_TYPES__ = {json.dumps(REFUTATION_TYPES)};
window.__SEVERITY_LEVELS__ = {json.dumps(SEVERITY_LEVELS)};
window.__DESCRIPTIONS__ = {json.dumps(descriptions)};
</script>
<script>
{app_js}
</script>

</body></html>"""

    with open(OUTPUT, 'w') as fh:
        fh.write(html)
    print(f"Dashboard generated: {OUTPUT}")


if __name__ == '__main__':
    main()
