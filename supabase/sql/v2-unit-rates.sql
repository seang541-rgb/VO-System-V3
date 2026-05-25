-- VO System V2 — Unit Rate Database
-- Malaysian construction unit rates for cost estimation
-- Apply after v2-schema.sql

BEGIN;

CREATE TABLE IF NOT EXISTS unit_rates (
  id            BIGSERIAL PRIMARY KEY,
  category      TEXT NOT NULL,                    -- 'concrete' | 'reinforcement' | 'formwork' | 'brickwork' | 'plasterwork' | 'painting' | 'roofing' | 'drainage' | 'earthwork' | 'other'
  item_code     TEXT,                             -- JKR/SMM2 code reference, e.g. 'F.10', 'G.20'
  description   TEXT NOT NULL,
  description_cn TEXT,
  unit          TEXT NOT NULL,                    -- 'm2' | 'm3' | 'm' | 'kg' | 'nr' | 'item' | 'tonne'
  rate_myr      NUMERIC NOT NULL,                -- unit rate in MYR
  region        TEXT NOT NULL DEFAULT 'national', -- 'national' | 'klang_valley' | 'johor' | 'penang' | 'sabah' | 'sarawak'
  rate_year     INT NOT NULL DEFAULT 2025,
  source        TEXT,                             -- 'JKR_SOR_2024' | 'CIDB_CIMS' | 'market_survey' | 'contractor_quote'
  min_rate      NUMERIC,
  max_rate      NUMERIC,
  notes         TEXT,
  verified      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE unit_rates IS 'Malaysian construction unit rates by material category, region, and year. Used by estimate_cost agent tool.';

CREATE INDEX IF NOT EXISTS idx_unit_rates_category ON unit_rates (category);
CREATE INDEX IF NOT EXISTS idx_unit_rates_region ON unit_rates (region);
CREATE INDEX IF NOT EXISTS idx_unit_rates_year ON unit_rates (rate_year);
CREATE INDEX IF NOT EXISTS idx_unit_rates_item_code ON unit_rates (item_code) WHERE item_code IS NOT NULL;

ALTER TABLE unit_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read_unit_rates" ON unit_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role_all_unit_rates" ON unit_rates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed essential rates ─────────────────────────────────────────────────────
INSERT INTO unit_rates (category, item_code, description, description_cn, unit, rate_myr, region, rate_year, source, min_rate, max_rate, verified) VALUES
  ('concrete', 'G.10', 'Grade 30 reinforced concrete (columns/beams)', '30级钢筋混凝土（柱/梁）', 'm3', 450, 'national', 2025, 'JKR_SOR_2024', 380, 520, true),
  ('concrete', 'G.10', 'Grade 30 reinforced concrete (slabs)', '30级钢筋混凝土（板）', 'm3', 420, 'national', 2025, 'JKR_SOR_2024', 360, 480, true),
  ('concrete', 'G.10', 'Grade 40 reinforced concrete', '40级钢筋混凝土', 'm3', 500, 'national', 2025, 'JKR_SOR_2024', 430, 570, true),
  ('reinforcement', 'F.10', 'High yield steel reinforcement (T10-T32)', '高强度钢筋（T10-T32）', 'kg', 4.20, 'national', 2025, 'JKR_SOR_2024', 3.80, 4.80, true),
  ('reinforcement', 'F.10', 'Mild steel reinforcement (R6-R10)', '普通钢筋（R6-R10）', 'kg', 4.50, 'national', 2025, 'JKR_SOR_2024', 4.00, 5.20, true),
  ('formwork', 'F.20', 'Formwork to columns (plywood)', '柱模板（胶合板）', 'm2', 55, 'national', 2025, 'JKR_SOR_2024', 45, 70, true),
  ('formwork', 'F.20', 'Formwork to slabs (plywood)', '板模板（胶合板）', 'm2', 42, 'national', 2025, 'JKR_SOR_2024', 35, 55, true),
  ('formwork', 'F.20', 'Formwork to beams (plywood)', '梁模板（胶合板）', 'm2', 60, 'national', 2025, 'JKR_SOR_2024', 48, 75, true),
  ('brickwork', 'H.10', 'Half brick wall (100mm clay brick)', '半砖墙（100mm红砖）', 'm2', 85, 'national', 2025, 'JKR_SOR_2024', 70, 100, true),
  ('brickwork', 'H.10', 'One brick wall (215mm clay brick)', '一砖墙（215mm红砖）', 'm2', 135, 'national', 2025, 'JKR_SOR_2024', 110, 160, true),
  ('plasterwork', 'M.10', 'Cement sand plaster (13mm to walls)', '水泥砂浆抹灰（13mm墙面）', 'm2', 18, 'national', 2025, 'JKR_SOR_2024', 14, 24, true),
  ('painting', 'N.10', 'Emulsion paint (2 coats to walls)', '乳胶漆（墙面2道）', 'm2', 12, 'national', 2025, 'JKR_SOR_2024', 8, 16, true),
  ('roofing', 'J.10', 'Concrete roof tiles on battens', '混凝土瓦片屋顶', 'm2', 95, 'national', 2025, 'JKR_SOR_2024', 75, 120, true),
  ('drainage', 'R.10', '150mm PVC pipe (underground)', '150mm PVC管（地下）', 'm', 45, 'national', 2025, 'JKR_SOR_2024', 35, 60, true),
  ('earthwork', 'D.10', 'Bulk excavation (max 1.5m deep)', '土方开挖（最深1.5m）', 'm3', 12, 'national', 2025, 'JKR_SOR_2024', 8, 18, true),
  ('earthwork', 'D.20', 'Backfilling with compaction', '回填压实', 'm3', 15, 'national', 2025, 'JKR_SOR_2024', 10, 22, true)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'Unit rates schema + seed data ready: ' || count(*) || ' rates' AS status FROM unit_rates;
