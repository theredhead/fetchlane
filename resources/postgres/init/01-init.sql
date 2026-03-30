-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create a test table for integration tests
CREATE TABLE IF NOT EXISTS test (
  id serial PRIMARY KEY,
  name varchar(100),
  description varchar(255),
  value int,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO test (name, description, value) VALUES
  ('alpha', 'First test record', 1),
  ('beta', 'Second test record', 2),
  ('gamma', 'Third test record', 3),
  ('delta', 'Fourth test record', 4);
