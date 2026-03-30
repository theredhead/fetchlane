#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: bash resources/postgres/list-pdok-layers.sh <filename-in-resources/postgres/import>"
  exit 1
fi

FILE_NAME="$1"
IMPORT_PATH="/import/${FILE_NAME}"
HOST_IMPORT_PATH="${SCRIPT_DIR}/import/${FILE_NAME}"

if [[ "${FILE_NAME}" == *.zip ]]; then
  zipinfo -1 "${HOST_IMPORT_PATH}" | grep -E '\.gml$' || true
else
  docker exec postgres-db-1 sh -lc "
    set -e
    test -f '${IMPORT_PATH}'
    ogrinfo '${IMPORT_PATH}'
  "
fi
