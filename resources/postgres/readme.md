# About the postgres/docker-compose.yml file

This docker compose file starts a PostgreSQL 16 + PostGIS database instance available at `localhost:5432`.

The setup now builds a small local image from `postgres:16` and installs PostGIS during the Docker build. This avoids the upstream `postgis/postgis` tags that are currently `amd64`-only and works on Apple Silicon / ARM64 machines.

## Starting the service

Make sure Docker Desktop is installed, then open a terminal and navigate into this directory:

```bash
docker compose up
```

Or from the project root:

```bash
docker compose -f resources/postgres/docker-compose.yml up
```

If you previously started this service with the wrong architecture image, rebuild it once:

```bash
docker compose -f resources/postgres/docker-compose.yml build --no-cache
docker compose -f resources/postgres/docker-compose.yml up --force-recreate
```

The database will be seeded automatically on first run using the SQL scripts in `init/`.

## Importing A Large PDOK Dataset

For national roads, street-like objects, parking areas, gas stations, and other map features, the closest bulk PDOK source is usually a `TOP10NL` download. If you already have the large PDOK file, place it in `resources/postgres/import/`. Both plain files and `.zip` archives are supported.

List the layers inside the file:

```bash
bash resources/postgres/list-pdok-layers.sh your-file.gpkg
```

Import all layers into PostgreSQL / PostGIS:

```bash
bash resources/postgres/import-pdok.sh your-file.gpkg
```

## Importing BAG Street Names

If you want nearest official street names, use the BAG addresses extract instead of TOP10NL alone. The BAG path in this repo builds four focused tables:

- `bag_openbareruimte`: street names
- `bag_nummeraanduiding`: links addresses to streets
- `bag_verblijfsobject`: point geometry for nearest lookups
- `bag_woonplaats`: city names for exact address geocoding

After downloading `lvbag-extract-nl.zip` into `resources/postgres/import/`, run:

```bash
bash resources/postgres/import-bag-streets.sh
```

Then query the nearest 5 distinct street names from a lon/lat input:

```sql
WITH input AS (
  SELECT ST_Transform(
    ST_SetSRID(ST_Point(4.895168, 52.370216), 4326),
    28992
  ) AS geom
)
SELECT straatnaam, MIN(ST_Distance(b.geom, input.geom)) AS distance_m
FROM bag_street_points b
CROSS JOIN input
GROUP BY straatnaam
ORDER BY distance_m
LIMIT 5;
```

And geocode by full address or postcode + house number:

```sql
SELECT
  o.naam AS straatnaam,
  n.huisnummer,
  n.postcode,
  w.naam AS woonplaats,
  ST_Y(ST_Transform(v.geom, 4326)) AS latitude,
  ST_X(ST_Transform(v.geom, 4326)) AS longitude
FROM bag_verblijfsobject v
JOIN bag_nummeraanduiding n ON n.identificatie = v.nummeraanduiding_id
JOIN bag_openbareruimte o ON o.identificatie = n.openbareruimte_id
LEFT JOIN bag_woonplaats w ON w.identificatie = o.woonplaats_id
WHERE lower(o.naam) = lower('Museumstraat')
  AND n.huisnummer = 1
  AND lower(w.naam) = lower('Amsterdam');
```

If you just changed the Docker image and do not have `ogr2ogr` in the container yet, rebuild once:

```bash
docker compose -f resources/postgres/docker-compose.yml build
docker compose -f resources/postgres/docker-compose.yml up -d
```

## Connection details

| Setting  | Value      |
|----------|------------|
| Host     | 127.0.0.1  |
| Port     | 5432       |
| User     | postgres   |
| Password | password   |
| Database | northwind  |

These match the defaults in `src/db.conf.ts` (`pgDatabaseConfiguration`).

## PostGIS

The PostGIS extension is enabled automatically by the init script. You can verify with:

```sql
SELECT PostGIS_Version();
```

## Data persistence

Data is stored in a Docker volume (`pg-data`) and persists between restarts. To reset:

```bash
docker compose down -v
```
