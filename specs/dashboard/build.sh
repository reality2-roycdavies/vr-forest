#!/bin/bash
cd "$(dirname "$0")/../.."
python3 specs/dashboard/parse_specs.py
python3 specs/dashboard/calculate.py
python3 specs/dashboard/generate.py
echo "Dashboard generated: specs/dashboard/index.html"
