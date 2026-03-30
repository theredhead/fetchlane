#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: bash resources/postgres/import-pdok.sh <filename-in-resources/postgres/import>"
  exit 1
fi

FILE_NAME="$1"
IMPORT_PATH="/import/${FILE_NAME}"
HOST_IMPORT_PATH="${SCRIPT_DIR}/import/${FILE_NAME}"
PG_CONN="PG:host=127.0.0.1 port=5432 dbname=northwind user=postgres password=password"

docker exec postgres-db-1 sh -lc "
  set -e
  test -f '${IMPORT_PATH}'
  export PGPASSWORD='password'
  psql -h 127.0.0.1 -U postgres -d northwind -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
"

if [[ "${FILE_NAME}" == *.zip ]]; then
  GML_FILES=()
  while IFS= read -r gml_file; do
    GML_FILES+=("${gml_file}")
  done < <(zipinfo -1 "${HOST_IMPORT_PATH}" | grep -E '\.gml$')

  if [[ ${#GML_FILES[@]} -eq 0 ]]; then
    echo "No GML files found inside ${FILE_NAME}"
    exit 1
  fi

  for gml_file in "${GML_FILES[@]}"; do
    layer_name="$(basename "${gml_file}" .gml)"
    echo "Importing ${gml_file} into ${layer_name}"
    docker exec postgres-db-1 sh -lc "
      set -e
      export PGPASSWORD='password'
      ogr2ogr \
        --config PG_USE_COPY YES \
        -progress \
        -overwrite \
        -skipfailures \
        -f PostgreSQL \"${PG_CONN}\" \
        '/vsizip/${IMPORT_PATH}/${gml_file}' \
        -nln '${layer_name}' \
        -lco GEOMETRY_NAME=geom \
        -lco FID=id \
        -lco PRECISION=NO \
        -nlt PROMOTE_TO_MULTI
    "
  done
else
  docker exec postgres-db-1 sh -lc "
    set -e
    export PGPASSWORD='password'
    ogr2ogr \
      --config PG_USE_COPY YES \
      -progress \
      -overwrite \
      -skipfailures \
      -f PostgreSQL \"${PG_CONN}\" \
      '${IMPORT_PATH}' \
      -lco GEOMETRY_NAME=geom \
      -lco FID=id \
      -lco PRECISION=NO \
      -nlt PROMOTE_TO_MULTI
  "
fi
