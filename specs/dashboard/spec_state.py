#!/usr/bin/env python3
"""Shared helpers for dashboard state generation and API responses.

Implements a Popperian refutation model: specs are conjectures, confidence
comes from surviving attempts to break them. Git-aware change detection
applies decay penalties when specs change after refutation attempts.

Adapted for VR Forest (client-side WebXR project).
"""

from __future__ import annotations

import json
import os
import subprocess
from collections import deque
from typing import Dict, List, Tuple, Any, Optional

BASE = os.path.join(os.path.dirname(__file__), 'spec-meta')
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ROSTER_FILE = os.path.join(BASE, 'reviewer_roster.json')

# Staleness decay multiplier: stale evidence (pre-change) gets this weight
STALE_DECAY = 0.4

# Refutation types and severity levels
REFUTATION_TYPES = [
    'peer_review', 'adversarial_vectors', 'dual_model_audit',
    'field_deployment', 'implementation_test', 'integration_test',
]

SEVERITY_LEVELS = [
    'casual', 'thorough', 'hostile', 'competing_models', 'real_world',
]

# Severity weight multipliers for confidence contribution
SEVERITY_WEIGHTS = {
    'casual': 0.5,
    'thorough': 0.8,
    'hostile': 1.0,
    'competing_models': 1.2,
    'real_world': 1.0,
}

# VR Forest adapted columns with WebXR-specific terminology
COLUMNS: List[Dict[str, Any]] = [
    {'id': 'reviewed', 'label': 'Survived Peer Review', 'icon': '🛡',
     'refutation_type': 'peer_review',
     'conjecture': 'This spec is internally consistent, complete, and free of logical errors — as judged by expert reading. Contradictions, ambiguities, missing edge cases, and unstated assumptions have been actively sought and not found.',
     'signals': ['review1', 'review2', 'expert'],
     'labels': ['1st reviewer', '2nd reviewer', 'Expert/external']},
    {'id': 'test_spec', 'label': 'Survived Test Vectors', 'icon': '⚔️',
     'refutation_type': 'adversarial_vectors',
     'conjecture': 'The spec\'s claims can be expressed as concrete, deterministic test cases — and those tests pass. If the spec says "X produces Y", there exist vectors proving it. Adversarial vectors designed to break edge cases have been tried and failed.',
     'signals': ['spec_vectors', 'json_vectors', 'adversarial'],
     'labels': ['Vectors in spec', 'JSON vectors', 'Adversarial vectors']},
    {'id': 'built', 'label': 'Survived Implementation', 'icon': '🔨',
     'refutation_type': 'implementation_test',
     'conjecture': 'The spec can be implemented in working code without discovering contradictions, gaps, or unimplementable requirements. The act of building it did not falsify the design — no "this can\'t actually work" moments survived.',
     'signals': ['partial', 'complete', 'optimised'],
     'labels': ['Partial/WIP', 'Complete', 'Optimised for Quest 3']},
    {'id': 'testing', 'label': 'Survived Automated Testing', 'icon': '🧪',
     'refutation_type': 'dual_model_audit',
     'conjecture': 'The implementation survives automated attempts to break it — unit tests, property-based testing, and visual regression. Machine-generated attacks at scale have not found violations of spec guarantees.',
     'signals': ['unit', 'automated', 'visual'],
     'labels': ['Unit tests', 'Automated vectors', 'Visual regression']},
    {'id': 'integrated', 'label': 'Survived Integration', 'icon': '🔗',
     'refutation_type': 'integration_test',
     'conjecture': 'The spec works correctly when composed with other systems in a running scene. Assumptions made by one spec about another have been tested at the boundaries. Cross-system interactions, update ordering, and emergent behaviours have been stressed without failure.',
     'signals': ['component', 'cross_system', 'full_scene'],
     'labels': ['Component tested', 'Cross-system', 'Full scene']},
    {'id': 'field', 'label': 'Survived VR Testing', 'icon': '🥽',
     'refutation_type': 'field_deployment',
     'conjecture': 'The spec survives contact with real hardware and real players. Desktop browser and Quest 3 headset both work. Sustained play (30+ minutes) reveals no frame drops, memory leaks, or comfort issues. This is the most expensive and most convincing form of refutation.',
     'signals': ['desktop', 'quest3', 'sustained'],
     'labels': ['Desktop browser', 'Quest 3 headset', 'Sustained play (30+ min)']},
]

SLOT_LABELS = {
    'review1': '1st reviewer',
    'review2': '2nd reviewer',
    'expert': 'Expert reviewer',
}

DEFAULT_ROSTER = {
    '_defaults': {
        'VF': {'review1': 'Roy Davies', 'review2': '', 'expert': ''},
    }
}


def _load_json(name: str) -> Dict[str, Any]:
    path = os.path.join(BASE, name)
    with open(path) as fh:
        return json.load(fh)


def _load_reviews() -> Dict[str, Any]:
    """Load all per-spec review files into a single dict."""
    reviews_dir = os.path.join(BASE, 'reviews')
    data: Dict[str, Any] = {}
    if not os.path.isdir(reviews_dir):
        return data
    for fname in sorted(os.listdir(reviews_dir)):
        if fname.endswith('.json'):
            code = fname[:-5]
            with open(os.path.join(reviews_dir, fname)) as fh:
                data[code] = json.load(fh)
    return data


def load_roster() -> Dict[str, Any]:
    if os.path.exists(ROSTER_FILE):
        with open(ROSTER_FILE) as fh:
            return json.load(fh)
    return DEFAULT_ROSTER.copy()


def _get_git_info(spec_path: str) -> Dict[str, Optional[str]]:
    """Get the latest git commit hash and date for a spec file."""
    if not spec_path:
        return {'commit': None, 'date': None}
    full_path = os.path.join(REPO_ROOT, spec_path)
    if not os.path.exists(full_path):
        return {'commit': None, 'date': None}
    try:
        result = subprocess.run(
            ['git', 'log', '-1', '--format=%H %aI', '--', spec_path],
            cwd=REPO_ROOT,
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split(' ', 1)
            return {'commit': parts[0], 'date': parts[1] if len(parts) > 1 else None}
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return {'commit': None, 'date': None}


def _get_all_git_info(deps: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Optional[str]]]:
    """Batch get git info for all spec files."""
    git_info = {}
    for code, dep_meta in deps.items():
        spec_path = dep_meta.get('path', '')
        git_info[code] = _get_git_info(spec_path)
    return git_info


def _is_evidence_stale(review: Dict[str, Any], current_commit: Optional[str]) -> bool:
    """Check if a review/refutation attempt is stale (spec changed since)."""
    if not current_commit:
        return False  # Can't determine staleness without git info
    spec_commit = review.get('spec_commit')
    if not spec_commit:
        # Legacy review without commit tracking -- treat as stale if we have current commit
        return True
    return spec_commit != current_commit


def _compute_refutation_breadth(reviews_list: List[Dict[str, Any]], current_commit: Optional[str]) -> Dict[str, Any]:
    """Compute refutation surface area -- how many different types survived (freshly)."""
    survived_types = set()
    survived_types_stale = set()
    all_types = set()

    for review in reviews_list:
        rtype = review.get('type', 'peer_review')
        outcome = review.get('outcome', 'survived')
        all_types.add(rtype)
        if outcome == 'survived':
            if _is_evidence_stale(review, current_commit):
                survived_types_stale.add(rtype)
            else:
                survived_types.add(rtype)

    total_possible = len(REFUTATION_TYPES)
    fresh_count = len(survived_types)
    stale_count = len(survived_types_stale - survived_types)

    return {
        'fresh_types': sorted(survived_types),
        'stale_types': sorted(survived_types_stale - survived_types),
        'fresh_count': fresh_count,
        'stale_count': stale_count,
        'total_possible': total_possible,
        'breadth_score': fresh_count / total_possible if total_possible else 0,
    }


def _normalize_review(review: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure backward compatibility -- add refutation fields to legacy reviews."""
    normalized = dict(review)
    if 'type' not in normalized:
        normalized['type'] = 'peer_review'
    if 'severity' not in normalized:
        normalized['severity'] = 'casual'
    if 'outcome' not in normalized:
        status = normalized.get('status', 'pending')
        if status == 'approved':
            normalized['outcome'] = 'survived'
        elif status in ('rejected', 'needs-changes'):
            normalized['outcome'] = 'falsified'
        else:
            normalized['outcome'] = 'survived'
    if 'spec_commit' not in normalized:
        normalized['spec_commit'] = None
    return normalized


def collect_reviewer_names(roster: Dict[str, Any], reviews: Dict[str, Any]) -> List[str]:
    names = set()

    def add(name):
        if name:
            names.add(name.strip())

    for defaults in roster.get('_defaults', {}).values():
        for candidate in defaults.values():
            add(candidate)

    for code, overrides in roster.items():
        if code == '_defaults':
            continue
        for candidate in overrides.values():
            add(candidate)

    for entry in reviews.values():
        for review in entry.get('reviews', []):
            add(review.get('reviewer'))

    return sorted(n for n in names if n)


def categorize(code: str) -> str:
    """All VF specs belong to one category."""
    return 'VR Forest'


def topo_sort_category(cat_codes: List[str], deps: Dict[str, Dict[str, Any]]) -> List[str]:
    in_degree = {}
    for code in cat_codes:
        dep_list = deps.get(code, {}).get('depends_on', [])
        in_degree[code] = sum(1 for d in dep_list if d in cat_codes)
    queue = deque(sorted([c for c in cat_codes if in_degree[c] == 0]))
    ordered: List[str] = []
    while queue:
        node = queue.popleft()
        ordered.append(node)
        for code in cat_codes:
            if node in deps.get(code, {}).get('depends_on', []):
                in_degree[code] -= 1
                if in_degree[code] == 0 and code not in queue:
                    queue.append(code)
        queue = deque(sorted(queue))
    ordered.extend(sorted(set(cat_codes) - set(ordered)))
    return ordered


def find_frontier(deps: Dict[str, Dict[str, Any]], conf: Dict[str, Dict[str, Any]]) -> set:
    frontier = set()
    for code, dep_info in deps.items():
        c_score = conf.get(code, {}).get('confidence', 0)
        if c_score >= 0.60:
            continue
        dep_list = dep_info.get('depends_on', [])
        if not dep_list or all(conf.get(d, {}).get('confidence', 0) >= 0.60 for d in dep_list):
            frontier.add(code)
    return frontier


def count_downstream(code: str, deps: Dict[str, Dict[str, Any]]) -> int:
    visited = set()
    queue = deque([code])
    while queue:
        node = queue.popleft()
        for other, info in deps.items():
            if other not in visited and node in info.get('depends_on', []):
                visited.add(other)
                queue.append(other)
    return len(visited)


def resolve_roster_assignment(code: str, roster: Dict[str, Any]) -> Dict[str, str]:
    prefix = code.split('-', 1)[0]
    defaults = roster.get('_defaults', {}).get(prefix, {})
    override = roster.get(code, {})
    assignments = {}
    for slot in SLOT_LABELS.keys():
        assignments[slot] = override.get(slot, defaults.get(slot, ''))
    return assignments


def build_slot_state(code: str, roster: Dict[str, Any], reviews_list: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    assignments = resolve_roster_assignment(code, roster)
    approved = [r for r in reviews_list if r.get('status') == 'approved']
    fulfilled_map = {
        'review1': approved[0] if len(approved) >= 1 else None,
        'review2': approved[1] if len(approved) >= 2 else None,
        'expert': None,
    }

    expert = next((r for r in reviews_list
                   if 'expert' in (r.get('note', '') or '').lower()), None)
    if expert is None and len(approved) >= 3:
        expert = approved[2]
    fulfilled_map['expert'] = expert

    slot_state = {}
    for slot, label in SLOT_LABELS.items():
        assignee = assignments.get(slot, '')
        latest_by_assignee = None
        if assignee:
            assignee_lower = assignee.lower()
            for r in reversed(reviews_list):
                if r.get('reviewer', '').lower() == assignee_lower:
                    latest_by_assignee = r
                    break
        fulfilled = fulfilled_map.get(slot)
        status = 'pending'
        if not assignee:
            status = 'unassigned'
        if latest_by_assignee:
            status = latest_by_assignee.get('status', status)
        if fulfilled:
            status = fulfilled.get('status', status)
        slot_state[slot] = {
            'label': label,
            'assignee': assignee,
            'fulfilled_by': fulfilled.get('reviewer') if fulfilled else '',
            'status': status,
            'date': fulfilled.get('date') if fulfilled else (latest_by_assignee or {}).get('date'),
            'note': fulfilled.get('note') if fulfilled else (latest_by_assignee or {}).get('note'),
        }
    return slot_state


def build_state() -> Dict[str, Any]:
    deps = _load_json('dependencies.json')
    conf = _load_json('confidence.json')
    reviews = _load_reviews()
    roster = load_roster()
    reviewer_names = collect_reviewer_names(roster, reviews)

    # Get git info for all specs
    git_info = _get_all_git_info(deps)

    frontier = find_frontier(deps, conf)
    total = len(conf)
    done = sum(1 for v in conf.values() if v['confidence'] >= 0.60)
    avg = sum(v['confidence'] for v in conf.values()) / total if total else 0

    categories: Dict[str, List[str]] = {}
    for code in deps:
        cat = categorize(code)
        categories.setdefault(cat, []).append(code)

    ordered_cats: List[Tuple[str, List[str]]] = []
    for cat in ['VR Forest']:
        if cat not in categories:
            continue
        topo = topo_sort_category(categories[cat], deps)
        done_list = [c for c in topo if conf.get(c, {}).get('confidence', 0) >= 0.60]
        front_list = [c for c in topo if c in frontier and c not in done_list]
        wait_list = [c for c in topo if c not in done_list and c not in front_list]
        ordered_cats.append((cat, done_list + front_list + wait_list))

    spec_data: Dict[str, Dict[str, Any]] = {}
    for code in deps:
        dep_meta = deps[code]
        conf_meta = conf.get(code, {})
        rev_meta = reviews.get(code, {})
        slot_state = build_slot_state(code, roster, rev_meta.get('reviews', []))
        spec_git = git_info.get(code, {})
        current_commit = spec_git.get('commit')

        # Normalize reviews for refutation model
        raw_reviews = rev_meta.get('reviews', [])
        normalized_reviews = [_normalize_review(r) for r in raw_reviews]

        # Compute staleness for each review
        reviews_with_staleness = []
        for r in normalized_reviews:
            enriched = dict(r)
            enriched['is_stale'] = _is_evidence_stale(r, current_commit)
            reviews_with_staleness.append(enriched)

        # Check if spec modified since last refutation
        has_any_reviews = len(raw_reviews) > 0
        spec_modified_since_review = False
        if has_any_reviews and current_commit:
            spec_modified_since_review = all(
                _is_evidence_stale(r, current_commit) for r in normalized_reviews
            )

        # Compute refutation breadth
        refutation_breadth = _compute_refutation_breadth(normalized_reviews, current_commit)

        # Compute per-evidence staleness for dots
        evidence_staleness = _compute_evidence_staleness(
            rev_meta.get('evidence', {}), normalized_reviews, current_commit
        )

        spec_data[code] = {
            'name': dep_meta.get('name', code),
            'version': dep_meta.get('version', ''),
            'path': dep_meta.get('path', ''),
            'depends_on': dep_meta.get('depends_on', []),
            'depended_by': dep_meta.get('depended_by', []),
            'downstream': count_downstream(code, deps),
            'confidence': conf_meta.get('confidence', 0),
            'cells': conf_meta.get('cells', {}),
            'penalties': conf_meta.get('penalties', []),
            'inherited_drops': conf_meta.get('inherited_drops', []),
            'frontier': code in frontier,
            'reviews_list': reviews_with_staleness,
            'evidence': rev_meta.get('evidence', {}),
            'issues': rev_meta.get('issues', []),
            'reviewer_slots': slot_state,
            # Refutation model fields
            'git_commit': current_commit,
            'git_date': spec_git.get('date'),
            'spec_modified_since_review': spec_modified_since_review,
            'refutation_breadth': refutation_breadth,
            'evidence_staleness': evidence_staleness,
        }

    summary = {
        'total': total,
        'done': done,
        'frontier': len(frontier),
        'avg': avg,
    }

    return {
        'deps': deps,
        'conf': conf,
        'reviews': reviews,
        'spec_data': spec_data,
        'frontier': frontier,
        'categories': ordered_cats,
        'summary': summary,
        'columns': COLUMNS,
        'reviewers': reviewer_names,
        'refutation_types': REFUTATION_TYPES,
        'severity_levels': SEVERITY_LEVELS,
    }


def _compute_evidence_staleness(
    evidence: Dict[str, Dict[str, bool]],
    reviews: List[Dict[str, Any]],
    current_commit: Optional[str],
) -> Dict[str, bool]:
    """Compute per-column staleness.

    A column is stale if evidence exists (any signal True) but all reviews
    that contributed to it are stale.
    """
    staleness = {}
    for col_id in ['reviewed', 'test_spec', 'built', 'testing', 'integrated', 'field']:
        col_evidence = evidence.get(col_id, {})
        has_evidence = any(v for v in col_evidence.values())
        if not has_evidence:
            staleness[col_id] = False
            continue
        if not current_commit:
            staleness[col_id] = False
            continue
        has_fresh = any(
            not _is_evidence_stale(r, current_commit) for r in reviews
        )
        staleness[col_id] = not has_fresh
    return staleness


__all__ = ['COLUMNS', 'SLOT_LABELS', 'REFUTATION_TYPES', 'SEVERITY_LEVELS',
           'build_state', 'load_roster']
