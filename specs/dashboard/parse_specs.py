#!/usr/bin/env python3
"""Parse VR Forest specification markdown files and extract metadata."""

import os
import re
import json

REPO_ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SPEC_DIRS = ['specs']
OUTPUT = os.path.join(os.path.dirname(__file__), 'spec-meta', 'dependencies.json')


def parse_spec(filepath, relpath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Name: first # heading
    m = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if not m:
        return None
    name = m.group(1).strip()

    # Short code: prefix before colon, or whole name if no colon
    if ':' in name:
        code = name.split(':')[0].strip()
    elif '—' in name:
        code = name.split('—')[0].strip()
    elif ' — ' in name:
        code = name.split(' — ')[0].strip()
    else:
        code = name.split()[0] if name.split() else name

    # Skip non-spec files (READMEs, etc.)
    if not re.match(r'^VF-', code):
        return None

    # Version (inline or table format)
    m = re.search(r'\*\*Version:?\*\*\s*(.+)', content)
    if m:
        version = m.group(1).strip().rstrip('|').strip()
    else:
        version = ''
    # Also try table format: | **Version** | 0.1 |
    if not version or '|' in version:
        m2 = re.search(r'\|\s*\*\*Version\*\*\s*\|\s*(.+?)\s*\|', content)
        if m2:
            version = m2.group(1).strip()

    # Status (inline or table format)
    m = re.search(r'\*\*Status:?\*\*\s*(.+)', content)
    if m:
        status = m.group(1).strip().rstrip('|').strip()
    else:
        status = ''
    if not status or '|' in status:
        m2 = re.search(r'\|\s*\*\*Status\*\*\s*\|\s*(.+?)\s*\|', content)
        if m2:
            status = m2.group(1).strip()

    # Dependencies
    deps = []
    m = re.search(r'\*\*(?:Depends on|Dependencies|Depend(?:s)? on):?\*\*\s*(.+)', content, re.IGNORECASE)
    if not m:
        # Try table format
        m = re.search(r'\|\s*\*\*(?:Depends on|Dependencies)\*\*\s*\|\s*(.+?)\s*\|', content, re.IGNORECASE)
    if m:
        dep_text = m.group(1)
        # Extract spec codes like VF-TERRAIN, VF-CONFIG
        deps = re.findall(r'(VF-[A-Z]+(?:-[A-Z]+)*)', dep_text)

    return {
        'name': name,
        'code': code,
        'version': version,
        'status': status,
        'path': relpath,
        'depends_on': deps,
    }


def main():
    specs = {}

    for d in SPEC_DIRS:
        dirpath = os.path.join(REPO_ROOT, d)
        if not os.path.isdir(dirpath):
            continue
        for fname in sorted(os.listdir(dirpath)):
            if not fname.endswith('.md'):
                continue
            filepath = os.path.join(dirpath, fname)
            relpath = os.path.join(d, fname)
            result = parse_spec(filepath, relpath)
            if result:
                code = result.pop('code')
                specs[code] = result

    # Compute reverse dependencies
    for code in specs:
        specs[code]['depended_by'] = []
    for code, info in specs.items():
        for dep in info['depends_on']:
            if dep in specs:
                specs[dep]['depended_by'].append(code)

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w') as f:
        json.dump(specs, f, indent=2)

    print(f"Parsed {len(specs)} specs -> {OUTPUT}")


if __name__ == '__main__':
    main()
