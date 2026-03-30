#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPORT_DIR="${SCRIPT_DIR}/import"
OUTER_ZIP="${IMPORT_DIR}/lvbag-extract-nl.zip"
OPR_ZIP="${IMPORT_DIR}/9999OPR08032026.zip"
NUM_ZIP="${IMPORT_DIR}/9999NUM08032026.zip"
VBO_ZIP="${IMPORT_DIR}/9999VBO08032026.zip"
WPL_ZIP="${IMPORT_DIR}/9999WPL08032026.zip"
OUTPUT_DIR="${IMPORT_DIR}/bag-streets"

if [[ ! -f "${OUTER_ZIP}" ]]; then
  echo "Missing ${OUTER_ZIP}"
  exit 1
fi

if [[ ! -f "${OPR_ZIP}" ]]; then
  unzip -p "${OUTER_ZIP}" 9999OPR08032026.zip > "${OPR_ZIP}"
fi

if [[ ! -f "${NUM_ZIP}" ]]; then
  unzip -p "${OUTER_ZIP}" 9999NUM08032026.zip > "${NUM_ZIP}"
fi

if [[ ! -f "${VBO_ZIP}" ]]; then
  unzip -p "${OUTER_ZIP}" 9999VBO08032026.zip > "${VBO_ZIP}"
fi

if [[ ! -f "${WPL_ZIP}" ]]; then
  unzip -p "${OUTER_ZIP}" 9999WPL08032026.zip > "${WPL_ZIP}"
fi

mkdir -p "${OUTPUT_DIR}"

python3 "${SCRIPT_DIR}/import-bag-streets.py" \
  --opr-zip "${OPR_ZIP}" \
  --num-zip "${NUM_ZIP}" \
  --vbo-zip "${VBO_ZIP}" \
  --wpl-zip "${WPL_ZIP}" \
  --output-dir "${OUTPUT_DIR}"

docker exec -i postgres-db-1 psql -U postgres -d northwind < "${SCRIPT_DIR}/import-bag-streets.sql"
