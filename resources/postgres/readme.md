# About the postgres/docker-compose.yml file

This docker compose file starts a plain PostgreSQL 16 database instance available at `localhost:5432`.

## Starting the service

Make sure Docker Desktop is installed, then open a terminal and navigate into this directory:

```bash
docker compose up
```

Or from the project root:

```bash
docker compose -f resources/postgres/docker-compose.yml up
```

The database will be seeded automatically on first run using the SQL scripts in `init/`.

## Connection details

| Setting  | Value      |
|----------|------------|
| Host     | 127.0.0.1  |
| Port     | 5432       |
| User     | postgres   |
| Password | password   |
| Database | northwind  |

## Data persistence

Data is stored in a Docker volume (`pg-data`) and persists between restarts. To reset:

```bash
docker compose down -v
```
