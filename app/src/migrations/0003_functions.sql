-- unaccent() from the unaccent extension is STABLE, not IMMUTABLE, so it cannot be
-- used directly inside an index expression. Pin the dictionary in an IMMUTABLE wrapper.
-- search_path is pinned explicitly: without it, resolving 'unaccent'::regdictionary
-- succeeds in an interactive session but fails when the function is inlined during
-- CREATE INDEX, which evaluates expressions under a different ambient search_path.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = public, pg_catalog
AS $$
  SELECT unaccent('unaccent'::regdictionary, $1)
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
