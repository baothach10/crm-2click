-- Bootstrap migration: extensions used by later migrations (search, accent-insensitive matching).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
