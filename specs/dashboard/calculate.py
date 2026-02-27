#!/usr/bin/env python3
"""Calculate per-cell and overall confidence scores for each spec.

Popperian refutation model: specs are conjectures, confidence comes from
surviving attempts to break them. Git-aware: evidence gathered before the
spec was last modified is considered stale and decayed.

Every cell in the 2D table (spec x pipeline stage) gets a continuous
confidence score (0.0-1.0) based on sub-evidence signals. The overall
spec confidence is derived FROM the per-cell scores (weighted average).
Single source of truth.

Dependency confidence propagation: after computing base scores, each
spec's confidence is reduced proportionally when its dependencies have
low confidence.  The propagation factor is the mean dependency
confidence scaled by DEP_PROPAGATION_WEIGHT.
"""

import json
import os
import subprocess
from collections import deque

BASE = os.path.join(os.path.dirname(__file__), 'spec-meta')
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# Staleness decay: stale evidence (pre-spec-change) gets this multiplier
STALE_DECAY = 0.4

# How much of the average dependency shortfall propagates to dependents.
# 0.30 means if all deps are at 0%, the dependent loses 30% of its score.
DEP_PROPAGATION_WEIGHT = 0.30

# Dependency confidence below this threshold triggers an inherited-drop warning.
DEP_DROP_THRESHOLD = 0.60

# Column definitions adapted for VR Forest (client-side WebXR project).
#
# Key adaptations from R2:
# - testing.visual replaces testing.human (visual regression > manual testing)
# - integrated.full_scene replaces integrated.system (all systems in one scene)
# - field: desktop + quest3 + sustained replace lab/pilot/production
COLUMNS = {
    'reviewed': {
        'weight': 0.15,
        'signals': {
            'review1': 0.40,
            'review2': 0.30,
            'expert': 0.30,
        }
    },
    'test_spec': {
        'weight': 0.20,
        'signals': {
            'spec_vectors': 0.35,
            'json_vectors': 0.35,
            'adversarial': 0.30,
        }
    },
    'built': {
        'weight': 0.20,
        'signals': {
            'partial': 0.30,
            'complete': 0.40,
            'optimised': 0.30,
        }
    },
    'testing': {
        'weight': 0.20,
        'signals': {
            'unit': 0.35,
            'automated': 0.35,
            'visual': 0.30,
        }
    },
    'integrated': {
        'weight': 0.15,
        'signals': {
            'component': 0.35,
            'cross_system': 0.35,
            'full_scene': 0.30,
        }
    },
    'field': {
        'weight': 0.10,
        'signals': {
            'desktop': 0.35,
            'quest3': 0.35,
            'sustained': 0.30,
        }
    },
}


def load(name):
    with open(os.path.join(BASE, name)) as f:
        return json.load(f)


def load_reviews():
    """Load all per-spec review files into a single dict."""
    reviews_dir = os.path.join(BASE, 'reviews')
    data = {}
    if not os.path.isdir(reviews_dir):
        return data
    for fname in sorted(os.listdir(reviews_dir)):
        if fname.endswith('.json'):
            code = fname[:-5]
            with open(os.path.join(reviews_dir, fname)) as f:
                data[code] = json.load(f)
    return data


def get_git_commit(spec_path):
    """Get the latest git commit hash for a spec file."""
    if not spec_path:
        return None
    try:
        result = subprocess.run(
            ['git', 'log', '-1', '--format=%H', '--', spec_path],
            cwd=REPO_ROOT,
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def is_evidence_stale(review, current_commit):
    """Check if a review's evidence is stale (spec changed since review)."""
    if not current_commit:
        return False
    spec_commit = review.get('spec_commit')
    if not spec_commit:
        return True  # Legacy review without commit tracking
    return spec_commit != current_commit


def compute_staleness_factor(reviews_list, current_commit):
    """Compute a staleness factor (0.0-1.0) for evidence.

    Returns 1.0 if all evidence is fresh, STALE_DECAY if all stale,
    weighted blend otherwise.
    """
    if not reviews_list or not current_commit:
        return 1.0  # No reviews or no git info -- no decay

    fresh = sum(1 for r in reviews_list
                if r.get('outcome', 'survived') == 'survived'
                and not is_evidence_stale(r, current_commit))
    total_survived = sum(1 for r in reviews_list
                         if r.get('outcome', 'survived') == 'survived')

    if total_survived == 0:
        return 1.0

    fresh_ratio = fresh / total_survived
    return STALE_DECAY + (1.0 - STALE_DECAY) * fresh_ratio


def get_evidence(rev):
    """Extract nested evidence from a reviews.json entry, with defaults."""
    return rev.get('evidence', {})


def calc_cell_confidence(evidence_for_col, col_def):
    """Calculate confidence for a single cell from its sub-evidence signals."""
    score = 0.0
    for signal_key, signal_weight in col_def['signals'].items():
        if evidence_for_col.get(signal_key, False):
            score += signal_weight
    return round(min(1.0, score), 4)


def topo_order(deps):
    """Return codes in topological order (dependencies before dependents)."""
    in_deg = {c: 0 for c in deps}
    for code, info in deps.items():
        for d in info.get('depends_on', []):
            if d in in_deg:
                in_deg[code] = in_deg.get(code, 0) + 1

    queue = deque(sorted(c for c, d in in_deg.items() if d == 0))
    ordered = []
    while queue:
        node = queue.popleft()
        ordered.append(node)
        for code, info in deps.items():
            if node in info.get('depends_on', []):
                in_deg[code] -= 1
                if in_deg[code] == 0:
                    queue.append(code)
    # Append any remaining (cycles) at the end
    ordered.extend(sorted(set(deps.keys()) - set(ordered)))
    return ordered


def main():
    deps = load('dependencies.json')
    reviews = load_reviews()

    # --- Get git commits for all specs ------------------------------------
    git_commits = {}
    for code, info in deps.items():
        git_commits[code] = get_git_commit(info.get('path', ''))

    # --- Pass 1: compute base confidence per spec -------------------------
    base_confidence = {}

    for code, info in deps.items():
        rev = reviews.get(code, {})
        evidence = get_evidence(rev)
        current_commit = git_commits.get(code)
        staleness = compute_staleness_factor(rev.get('reviews', []), current_commit)

        # For reviewed column, also count approved reviews from reviews list
        reviewed_ev = dict(evidence.get('reviewed', {}))
        approved = [r for r in rev.get('reviews', []) if r.get('status') == 'approved']
        if len(approved) >= 1 and not reviewed_ev.get('review1'):
            reviewed_ev['review1'] = True
        if len(approved) >= 2 and not reviewed_ev.get('review2'):
            reviewed_ev['review2'] = True

        # Calculate per-cell confidence
        cells = {}
        cell_inputs = {
            'reviewed': reviewed_ev,
            'test_spec': evidence.get('test_spec', {}),
            'built': evidence.get('built', {}),
            'testing': evidence.get('testing', {}),
            'integrated': evidence.get('integrated', {}),
            'field': evidence.get('field', {}),
        }

        for col_name, col_def in COLUMNS.items():
            cells[col_name] = calc_cell_confidence(
                cell_inputs.get(col_name, {}), col_def
            )

        # Apply staleness decay to cell scores
        for col in cells:
            cells[col] = round(cells[col] * staleness, 4)

        # Overall = weighted average of cell confidences + exists bonus
        exists_bonus = 0.05 if info.get('version') else 0.0
        weighted = sum(
            cells[col] * COLUMNS[col]['weight']
            for col in COLUMNS
        )
        overall = exists_bonus + weighted * (1.0 - exists_bonus)

        # Penalties
        penalties = []
        open_issues = [i for i in rev.get('issues', []) if not i.get('resolved', False)]
        if open_issues:
            penalty = len(open_issues) * 0.03
            overall -= penalty
            penalties.append(f"{len(open_issues)} open issue(s): -{penalty:.2f}")

        # Dependency decay: if a dependency's version changed since last review
        for dep_code in info.get('depends_on', []):
            if dep_code in deps and dep_code in reviews:
                dep_rev = reviews[dep_code]
                dep_approved = [r for r in dep_rev.get('reviews', []) if r.get('status') == 'approved']
                if approved and dep_approved:
                    dep_ver = deps[dep_code].get('version', '')
                    latest_dep_review_ver = dep_approved[-1].get('version', '')
                    if dep_ver and latest_dep_review_ver and dep_ver != latest_dep_review_ver:
                        overall -= 0.10
                        for col in ['testing', 'integrated', 'field']:
                            cells[col] = max(0.0, cells[col] - 0.15)
                        penalties.append(f"Dependency {dep_code} version changed")

        overall = round(max(0.0, min(1.0, overall)), 2)

        base_confidence[code] = {
            'confidence': overall,
            'cells': {k: round(v, 2) for k, v in cells.items()},
            'penalties': penalties,
        }

    # --- Pass 2: propagate dependency confidence drops --------------------
    # Process in topological order so upstream scores are finalised first.
    ordered = topo_order(deps)
    confidence = {}

    for code in ordered:
        base = base_confidence[code]
        overall = base['confidence']
        cells = dict(base['cells'])
        penalties = list(base['penalties'])
        inherited_drops = []

        dep_list = deps[code].get('depends_on', [])
        if dep_list:
            dep_scores = []
            for dep_code in dep_list:
                # Use already-propagated score if available, else base
                dep_conf = confidence.get(dep_code, base_confidence.get(dep_code, {}))
                dep_score = dep_conf.get('confidence', 0.0)
                dep_scores.append(dep_score)

                if dep_score < DEP_DROP_THRESHOLD:
                    inherited_drops.append({
                        'from': dep_code,
                        'dep_confidence': dep_score,
                    })

            if dep_scores:
                avg_dep = sum(dep_scores) / len(dep_scores)
                shortfall = 1.0 - avg_dep
                dep_penalty = shortfall * DEP_PROPAGATION_WEIGHT
                if dep_penalty > 0.001:
                    overall = overall * (1.0 - dep_penalty)
                    # Also scale down cells proportionally
                    for col in cells:
                        cells[col] = round(cells[col] * (1.0 - dep_penalty), 2)
                    if inherited_drops:
                        drop_names = ', '.join(d['from'] for d in inherited_drops)
                        penalties.append(
                            f"Inherited drop from {drop_names}: "
                            f"-{dep_penalty*100:.1f}%"
                        )

        overall = round(max(0.0, min(1.0, overall)), 2)

        confidence[code] = {
            'confidence': overall,
            'cells': cells,
            'penalties': penalties,
            'needs_attention': overall < 0.60 or len(penalties) > 0,
            'inherited_drops': inherited_drops,
        }

    with open(os.path.join(BASE, 'confidence.json'), 'w') as f:
        json.dump(confidence, f, indent=2)

    print(f"Calculated confidence for {len(confidence)} specs")


if __name__ == '__main__':
    main()
