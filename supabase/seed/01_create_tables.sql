-- Idea Nest — Knowledge Base Schema
-- 8 reference tables backing the Copilot's regulatory / contract / pricing reasoning.
-- All tables: RLS on, authenticated read, service_role full access.
-- Apply order: this file first, then 02-09 seed files in numeric order.

BEGIN;

-- ── 1. Contract clauses (JKR 203, PAM 2006/2018, FIDIC, etc.) ───────────────
CREATE TABLE IF NOT EXISTS contract_clauses (
  id              BIGSERIAL PRIMARY KEY,
  contract_type   TEXT NOT NULL,                  -- e.g. 'JKR_203', 'PAM_2006', 'PAM_2018', 'FIDIC_RED'
  clause_number   TEXT NOT NULL,                  -- e.g. '31.1', '11.4'
  title_en        TEXT,
  title_cn        TEXT,
  content_en      TEXT,
  content_cn      TEXT,
  category        TEXT,                           -- 'variation' | 'payment' | 'claim' | 'eot' | 'termination'
  keywords        TEXT[] DEFAULT '{}',
  verified        BOOLEAN DEFAULT TRUE,
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (contract_type, clause_number)
);
COMMENT ON TABLE contract_clauses IS 'Standard contract clause library (JKR 203, PAM 2006/2018, FIDIC). Used by analyze_contract_clause tool for claim assessment.';
CREATE INDEX IF NOT EXISTS idx_contract_clauses_type ON contract_clauses (contract_type);
CREATE INDEX IF NOT EXISTS idx_contract_clauses_category ON contract_clauses (category);
CREATE INDEX IF NOT EXISTS idx_contract_clauses_keywords ON contract_clauses USING GIN (keywords);

-- ── 2. UBBL (Uniform Building By-Laws 1984) provisions ─────────────────────
CREATE TABLE IF NOT EXISTS ubbl_provisions (
  id              BIGSERIAL PRIMARY KEY,
  part            TEXT NOT NULL,                  -- e.g. 'V', 'VI', 'XII'
  by_law_number   TEXT NOT NULL,                  -- e.g. '23', '88'
  title           TEXT,
  title_cn        TEXT,
  content         TEXT,
  content_cn      TEXT,
  category        TEXT,                           -- 'dimension' | 'fire' | 'access' | 'parking'
  numeric_value   NUMERIC,                        -- e.g. 2.75 (for "minimum ceiling height 2.75m")
  unit            TEXT,                           -- 'm' | 'mm' | '%' | 'storey' | 'm2'
  verified        BOOLEAN DEFAULT TRUE,
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (part, by_law_number)
);
COMMENT ON TABLE ubbl_provisions IS 'Malaysia UBBL 1984 by-law provisions. Referenced by the audit + compliance tools.';
CREATE INDEX IF NOT EXISTS idx_ubbl_part ON ubbl_provisions (part);
CREATE INDEX IF NOT EXISTS idx_ubbl_category ON ubbl_provisions (category);

-- ── 3. Malaysian Standards (MS) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ms_standards (
  id                BIGSERIAL PRIMARY KEY,
  standard_number   TEXT NOT NULL UNIQUE,         -- e.g. 'MS 522', 'MS 1064'
  title             TEXT,
  title_cn          TEXT,
  category          TEXT,                         -- 'cement' | 'steel' | 'concrete' | 'fire' | 'mep'
  scope             TEXT,
  year              INT,
  verified          BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE ms_standards IS 'Malaysian Standards (MS) referenced in JKR / SMM2 specifications.';
CREATE INDEX IF NOT EXISTS idx_ms_category ON ms_standards (category);

-- ── 4. VO templates (request letter, cost breakdown, approval form) ────────
CREATE TABLE IF NOT EXISTS vo_templates (
  id              BIGSERIAL PRIMARY KEY,
  template_type   TEXT NOT NULL,                  -- 'request_letter' | 'cost_breakdown' | 'approval_form'
  contract_type   TEXT,                           -- which contract this aligns with
  title           TEXT,
  title_cn        TEXT,
  content         TEXT,                           -- markdown / template text with {{placeholders}}
  content_cn      TEXT,
  fields          JSONB DEFAULT '[]'::jsonb,      -- [{name, label, type, required}]
  verified        BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE vo_templates IS 'Boilerplate VO documents: request letters, cost breakdowns, approval forms.';
CREATE INDEX IF NOT EXISTS idx_vo_templates_type ON vo_templates (template_type);

-- ── 5. Measurement codes (SMM2 + NRM) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS measurement_codes (
  id              BIGSERIAL PRIMARY KEY,
  system          TEXT NOT NULL,                  -- 'SMM2' | 'NRM'
  section_code    TEXT NOT NULL,                  -- e.g. 'A', 'F', '1', '2'
  title           TEXT,
  title_cn        TEXT,
  description     TEXT,
  description_cn  TEXT,
  verified        BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (system, section_code)
);
COMMENT ON TABLE measurement_codes IS 'SMM2 section codes (A-Z) + NRM element codes (1-9). Backbone of BQ classification.';
CREATE INDEX IF NOT EXISTS idx_measurement_system ON measurement_codes (system);

-- ── 6. BIM regulations (CITP, BIM mandate, IBS, etc.) ──────────────────────
CREATE TABLE IF NOT EXISTS bim_regulations (
  id                BIGSERIAL PRIMARY KEY,
  regulation_type   TEXT NOT NULL,                -- 'policy' | 'mandate' | 'act' | 'plan'
  title             TEXT NOT NULL,
  title_cn          TEXT,
  issuing_body      TEXT,                         -- e.g. 'CIDB', 'JKR', 'KPKT'
  document_number   TEXT,
  effective_date    DATE,
  value_threshold   NUMERIC,                      -- e.g. 100_000_000 (RM 100M project value trigger)
  currency          TEXT DEFAULT 'MYR',
  scope             TEXT,
  scope_cn          TEXT,
  verified          BOOLEAN DEFAULT TRUE,
  source_url        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE bim_regulations IS 'Malaysian BIM mandates and construction industry policies (CITP, 11MP, IBS, Act 520).';
CREATE INDEX IF NOT EXISTS idx_bim_reg_type ON bim_regulations (regulation_type);
CREATE INDEX IF NOT EXISTS idx_bim_reg_date ON bim_regulations (effective_date);

-- ── 7. Competitor pricing (CostX, Cubicost, Cubit, Bluebeam, etc.) ─────────
CREATE TABLE IF NOT EXISTS competitor_pricing (
  id              BIGSERIAL PRIMARY KEY,
  competitor_name TEXT NOT NULL,                  -- e.g. 'Exactal CostX', 'Glodon Cubicost'
  product_name    TEXT NOT NULL,                  -- specific SKU
  pricing_model   TEXT,                           -- 'subscription_monthly' | 'subscription_annual' | 'perpetual' | 'usage'
  price_myr       NUMERIC,
  billing_period  TEXT,                           -- 'month' | 'year' | 'one-time'
  features        TEXT[] DEFAULT '{}',
  region          TEXT DEFAULT 'Malaysia',
  notes           TEXT,
  verified        BOOLEAN DEFAULT FALSE,          -- pricing changes often, default uncertain
  source_url      TEXT,
  fetched_at      DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE competitor_pricing IS 'Construction software competitor pricing in MYR. Used for pricing strategy comparisons.';
CREATE INDEX IF NOT EXISTS idx_competitor_name ON competitor_pricing (competitor_name);

-- ── 8. QS companies in Klang Valley (target beta users / partners) ─────────
CREATE TABLE IF NOT EXISTS qs_companies (
  id              BIGSERIAL PRIMARY KEY,
  company_name    TEXT NOT NULL,
  location        TEXT,                           -- 'Kuala Lumpur' | 'PJ' | 'Shah Alam' | 'Subang Jaya' | 'Cheras'
  website         TEXT,
  estimated_size  TEXT,                           -- 'micro <5' | 'small 5-20' | 'medium 20-50'
  services        TEXT[] DEFAULT '{}',
  contact_person  TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  status          TEXT DEFAULT 'prospect',        -- 'prospect' | 'contacted' | 'beta_signup' | 'paying'
  notes           TEXT,
  verified        BOOLEAN DEFAULT FALSE,          -- defaults to unverified; mark TRUE after confirming
  created_at      TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE qs_companies IS 'Klang Valley QS consultancy directory — beta user prospect list.';
CREATE INDEX IF NOT EXISTS idx_qs_location ON qs_companies (location);
CREATE INDEX IF NOT EXISTS idx_qs_status ON qs_companies (status);

-- ── Row-Level Security ─────────────────────────────────────────────────────
-- Pattern: authenticated users can read; service_role (Edge Functions) full access.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'contract_clauses',
      'ubbl_provisions',
      'ms_standards',
      'vo_templates',
      'measurement_codes',
      'bim_regulations',
      'competitor_pricing',
      'qs_companies'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_read" ON %I', tbl);
    EXECUTE format('CREATE POLICY "authenticated_read" ON %I FOR SELECT TO authenticated USING (true)', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON %I', tbl);
    EXECUTE format('CREATE POLICY "service_role_all" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;

COMMIT;

-- Verify
SELECT 'Schema ready: ' || count(*) || ' tables created' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('contract_clauses','ubbl_provisions','ms_standards','vo_templates','measurement_codes','bim_regulations','competitor_pricing','qs_companies');
