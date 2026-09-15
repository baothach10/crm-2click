-- Trigram search handles partial and misspelled names the way this CRM will actually be
-- searched; a tsvector prefix index does not. Case/accent-folded via immutable_unaccent()
-- so the app can query with the same normalisation and hit the index.
CREATE INDEX company_name_trgm_idx
  ON company USING gin (lower(immutable_unaccent(name)) gin_trgm_ops);

CREATE INDEX contact_full_name_trgm_idx
  ON contact USING gin (lower(immutable_unaccent(first_name || ' ' || last_name)) gin_trgm_ops);

CREATE INDEX contact_email_trgm_idx
  ON contact USING gin (lower(email) gin_trgm_ops);
