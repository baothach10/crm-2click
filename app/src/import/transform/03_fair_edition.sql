INSERT INTO fair_edition (edition_code, fair_id, city, venue, starts_on, ends_on, max_stand_height_m)
SELECT
  fe.fair_edition_code,
  f.id,
  fe.city,
  fe.venue,
  to_date(fe.starts_on, 'DD/MM/YYYY'),
  to_date(fe.ends_on, 'DD/MM/YYYY'),
  replace(fe.max_stand_height_m, ',', '.')::numeric
FROM staging.fair_editions fe
JOIN fair f ON f.name = btrim(fe.fair_name)
ON CONFLICT (edition_code) DO NOTHING;
