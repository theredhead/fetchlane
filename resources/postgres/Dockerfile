FROM postgres:16

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gdal-bin \
        postgresql-16-postgis-3 \
        postgresql-16-postgis-3-scripts \
    && rm -rf /var/lib/apt/lists/*
