CREATE TABLE company (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_code text NOT NULL UNIQUE,
  name text NOT NULL,
  province_code varchar(2) NOT NULL,
  region text NOT NULL,
  owner_rep_id bigint NOT NULL REFERENCES sales_rep (id)
);

CREATE INDEX company_owner_rep_id_idx ON company (owner_rep_id);

-- One row per contact; company details repeat in the source export when an exhibitor
-- has several contacts, but here they live once on `company`.
CREATE TABLE contact (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_code text NOT NULL UNIQUE,
  company_id bigint NOT NULL REFERENCES company (id),
  legacy_row_id text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  fax text
);

CREATE INDEX contact_company_id_idx ON contact (company_id);
