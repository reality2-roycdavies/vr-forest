#!/bin/bash
# Poll for spec changes and rebuild dashboard.
# Usage: nohup bash specs/dashboard/watch.sh >> specs/dashboard/watch.log 2>&1 &

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_DIR"

LAST_HASH=""

while true; do
    CURRENT_HASH=$(find specs -name 'VF-*.md' -newer specs/dashboard/index.html 2>/dev/null | md5sum)

    if [ "$CURRENT_HASH" != "$LAST_HASH" ] && [ -f specs/dashboard/index.html ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') Changes detected, rebuilding..."
        bash specs/dashboard/build.sh
        LAST_HASH="$CURRENT_HASH"
        echo "$(date '+%Y-%m-%d %H:%M:%S') Dashboard rebuilt."
    elif [ ! -f specs/dashboard/index.html ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') No index.html found, building..."
        bash specs/dashboard/build.sh
        LAST_HASH="$CURRENT_HASH"
    fi

    sleep 300  # 5 minutes
done
