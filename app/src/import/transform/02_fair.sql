INSERT INTO fair (name)
SELECT DISTINCT btrim(fair_name)
FROM staging.fair_editions
ON CONFLICT (name) DO NOTHING;
