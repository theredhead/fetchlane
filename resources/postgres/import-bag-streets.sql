CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS bag_openbareruimte (
  identificatie text PRIMARY KEY,
  naam text NOT NULL,
  type text,
  status text,
  woonplaats_id text
);

CREATE TABLE IF NOT EXISTS bag_nummeraanduiding (
  identificatie text PRIMARY KEY,
  huisnummer integer,
  huisletter text,
  huisnummertoevoeging text,
  postcode text,
  type_adresseerbaar_object text,
  status text,
  openbareruimte_id text
);

CREATE TABLE IF NOT EXISTS bag_verblijfsobject (
  identificatie text PRIMARY KEY,
  nummeraanduiding_id text,
  geom geometry(Point, 28992),
  status text,
  oppervlakte integer
);

CREATE TABLE IF NOT EXISTS bag_woonplaats (
  identificatie text PRIMARY KEY,
  naam text NOT NULL,
  status text
);

TRUNCATE TABLE bag_verblijfsobject;
TRUNCATE TABLE bag_nummeraanduiding;
TRUNCATE TABLE bag_openbareruimte;
TRUNCATE TABLE bag_woonplaats;

\copy bag_openbareruimte (identificatie, naam, type, status, woonplaats_id) FROM '/import/bag-streets/bag_openbareruimte.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL '\N');
\copy bag_nummeraanduiding (identificatie, huisnummer, huisletter, huisnummertoevoeging, postcode, type_adresseerbaar_object, status, openbareruimte_id) FROM '/import/bag-streets/bag_nummeraanduiding.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL '\N');
\copy bag_woonplaats (identificatie, naam, status) FROM '/import/bag-streets/bag_woonplaats.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL '\N');

CREATE TEMP TABLE bag_verblijfsobject_stage (
  identificatie text,
  nummeraanduiding_id text,
  x double precision,
  y double precision,
  status text,
  oppervlakte integer
);

\copy bag_verblijfsobject_stage (identificatie, nummeraanduiding_id, x, y, status, oppervlakte) FROM '/import/bag-streets/bag_verblijfsobject.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL '\N');

INSERT INTO bag_verblijfsobject (identificatie, nummeraanduiding_id, geom, status, oppervlakte)
SELECT
  identificatie,
  nummeraanduiding_id,
  ST_SetSRID(ST_MakePoint(x, y), 28992),
  status,
  oppervlakte
FROM bag_verblijfsobject_stage;

DROP TABLE bag_verblijfsobject_stage;

CREATE INDEX IF NOT EXISTS bag_openbareruimte_naam_idx ON bag_openbareruimte (naam);
CREATE INDEX IF NOT EXISTS bag_woonplaats_naam_idx ON bag_woonplaats (naam);
CREATE INDEX IF NOT EXISTS bag_nummeraanduiding_openbareruimte_idx ON bag_nummeraanduiding (openbareruimte_id);
CREATE INDEX IF NOT EXISTS bag_verblijfsobject_nummeraanduiding_idx ON bag_verblijfsobject (nummeraanduiding_id);
CREATE INDEX IF NOT EXISTS bag_verblijfsobject_geom_idx ON bag_verblijfsobject USING GIST (geom);

CREATE OR REPLACE VIEW bag_street_points AS
SELECT
  v.identificatie AS verblijfsobject_id,
  n.identificatie AS nummeraanduiding_id,
  o.identificatie AS openbareruimte_id,
  o.naam AS straatnaam,
  o.woonplaats_id,
  v.geom
FROM bag_verblijfsobject v
JOIN bag_nummeraanduiding n ON n.identificatie = v.nummeraanduiding_id
JOIN bag_openbareruimte o ON o.identificatie = n.openbareruimte_id
WHERE o.type = 'Weg'
  AND o.status = 'Naamgeving uitgegeven';
