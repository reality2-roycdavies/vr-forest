#!/usr/bin/env python3
"""Tiny HTTP server for the VR Forest Spec Confidence dashboard with inline APIs."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from spec_state import build_state, load_roster, SLOT_LABELS

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DASHBOARD_DIR = os.path.join(REPO_ROOT, 'specs', 'dashboard')
SPEC_META_DIR = os.path.join(DASHBOARD_DIR, 'spec-meta')
DEPS_FILE = os.path.join(SPEC_META_DIR, 'dependencies.json')
REVIEW_SCRIPT = os.path.join(DASHBOARD_DIR, 'review.py')
GENERATE_SCRIPT = os.path.join(DASHBOARD_DIR, 'generate.py')
ROSTER_FILE = os.path.join(SPEC_META_DIR, 'reviewer_roster.json')
ALLOWED_REVIEW_STATUSES = {'approved', 'needs-changes', 'rejected'}


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DASHBOARD_DIR, **kwargs)

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            self.path = '/index.html'
            return super().do_GET()
        if self.path.startswith('/api/ping'):
            return self._send_json({'ok': True})
        if self.path.startswith('/api/spec/'):
            code = self.path.split('/')[-1].upper()
            state = build_state()
            spec = state['spec_data'].get(code)
            if not spec:
                return self._send_json({'error': 'Spec not found'}, status=HTTPStatus.NOT_FOUND)
            return self._send_json({'spec': spec})
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/evidence':
            return self._handle_evidence()
        if self.path == '/api/review':
            return self._handle_review()
        if self.path == '/api/assignment':
            return self._handle_assignment()
        return self._send_json({'error': 'Unknown endpoint'}, status=HTTPStatus.NOT_FOUND)

    def _handle_evidence(self):
        data = self._read_json()
        spec = (data.get('spec') or '').upper()
        changes = data.get('changes') or {}
        if not spec or not changes:
            return self._send_json({'error': 'spec and changes are required'}, status=HTTPStatus.BAD_REQUEST)
        for key, value in changes.items():
            value_str = 'true' if bool(value) else 'false'
            args = [sys.executable, REVIEW_SCRIPT, spec, '--set', f'{key}={value_str}']
            proc = subprocess.run(args, cwd=REPO_ROOT, capture_output=True, text=True)
            if proc.returncode != 0:
                return self._send_json(
                    {
                        'error': 'Failed to update evidence',
                        'details': proc.stderr.strip() or proc.stdout.strip(),
                    },
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )
        state = build_state()
        spec_blob = state['spec_data'].get(spec)
        return self._send_json({'spec': spec_blob})

    def _handle_review(self):
        data = self._read_json()
        spec = (data.get('spec') or '').upper()
        reviewer = (data.get('reviewer') or '').strip()
        status = (data.get('status') or '').strip().lower()
        note = (data.get('note') or '').strip()
        ref_type = (data.get('type') or '').strip().lower()
        severity = (data.get('severity') or '').strip().lower()
        outcome = (data.get('outcome') or '').strip().lower()
        falsification = (data.get('falsification') or '').strip()
        if not spec or not reviewer or status not in ALLOWED_REVIEW_STATUSES:
            return self._send_json({'error': 'spec, reviewer, and valid status are required'}, status=HTTPStatus.BAD_REQUEST)
        args = [sys.executable, REVIEW_SCRIPT, spec, '--reviewer', reviewer, '--status', status]
        if note:
            args += ['--note', note]
        if ref_type:
            args += ['--type', ref_type]
        if severity:
            args += ['--severity', severity]
        if outcome:
            args += ['--outcome', outcome]
        if falsification:
            args += ['--falsification', falsification]
        proc = subprocess.run(args, cwd=REPO_ROOT, capture_output=True, text=True)
        if proc.returncode != 0:
            return self._send_json(
                {
                    'error': 'Failed to record review',
                    'details': proc.stderr.strip() or proc.stdout.strip(),
                },
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )
        state = build_state()
        spec_blob = state['spec_data'].get(spec)
        return self._send_json({'spec': spec_blob})

    def _handle_assignment(self):
        data = self._read_json()
        spec = (data.get('spec') or '').upper()
        slot = (data.get('slot') or '').lower()
        reviewer = (data.get('reviewer') or '').strip()
        if not spec or slot not in SLOT_LABELS:
            return self._send_json({'error': 'spec and valid slot are required'}, status=HTTPStatus.BAD_REQUEST)
        if not self._spec_exists(spec):
            return self._send_json({'error': 'Unknown spec'}, status=HTTPStatus.NOT_FOUND)
        roster = load_roster()
        overrides = roster.setdefault(spec, {})
        if reviewer:
            overrides[slot] = reviewer
        else:
            overrides.pop(slot, None)
            if spec in roster and spec != '_defaults' and not overrides:
                roster.pop(spec)
        self._write_roster(roster)
        self._regen_index()
        state = build_state()
        spec_blob = state['spec_data'].get(spec)
        return self._send_json({'spec': spec_blob})

    def _spec_exists(self, code: str) -> bool:
        if not os.path.exists(DEPS_FILE):
            return False
        with open(DEPS_FILE) as fh:
            deps = json.load(fh)
        return code in deps

    def _write_roster(self, roster):
        os.makedirs(os.path.dirname(ROSTER_FILE), exist_ok=True)
        with open(ROSTER_FILE, 'w') as fh:
            json.dump(roster, fh, indent=2)

    def _regen_index(self):
        subprocess.run([sys.executable, GENERATE_SCRIPT], cwd=REPO_ROOT, capture_output=True)

    def _read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length else b''
        if not raw:
            return {}
        try:
            return json.loads(raw.decode('utf-8'))
        except json.JSONDecodeError:
            return {}

    def _send_json(self, payload, status=HTTPStatus.OK):
        blob = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)

    def log_message(self, fmt, *args):
        """Squash default noisy logging."""
        sys.stdout.write(f"[dashboard] {self.address_string()} - {fmt % args}\n")


def main():
    parser = argparse.ArgumentParser(description='Serve VR Forest dashboard with inline API')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8090)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Dashboard server running at http://{args.host}:{args.port}/")
    print(f"  Serving from: {DASHBOARD_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down...')
        server.server_close()


if __name__ == '__main__':
    main()
