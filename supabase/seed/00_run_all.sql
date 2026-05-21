-- =============================================================
-- Idea Nest — Master Seed Bundle (auto-concatenated)
-- Paste this entire file ONCE into Supabase SQL Editor + Run.
-- Source files: 01-09 in this directory.
-- =============================================================


-- ==============================================================
-- 01_create_tables.sql
-- ==============================================================
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


-- ==============================================================
-- 02_seed_contract_clauses.sql
-- ==============================================================
-- Seed: contract_clauses
-- JKR 203 Clause 31 (Variation) + 32 (Payment) + PAM 2006 Clause 11 + PAM 2018 Clause 11.1
-- All bilingual (English + 中文). Idempotent via ON CONFLICT.

BEGIN;

INSERT INTO contract_clauses
  (contract_type, clause_number, title_en, title_cn, content_en, content_cn, category, keywords, verified)
VALUES
-- ── JKR 203 — Clause 31 (Variation) ──────────────────────────────────────
('JKR_203', '31.1',
 'Power of S.O. to Order Variations',
 'S.O. 发出变更指令的权力',
 'The S.O. may, by written instruction, order any Variation that he considers necessary or desirable for the proper completion and/or functioning of the Works. Such Variation shall not vitiate this Contract.',
 'S.O. 可以书面指令的方式，命令任何其认为对正确完成和/或工程功能所必需或可取的变更。此类变更不应使本合同无效。',
 'variation',
 ARRAY['variation','SO','written instruction','工程变更','书面指令'],
 TRUE),

('JKR_203', '31.2',
 'Variation Order — Written Form Required',
 '变更指令必须书面化',
 'No Variation required by the S.O. or approved by the S.O. shall vitiate this Contract; provided that no Variation shall be made by the Contractor without a written Variation Order from the S.O.',
 'S.O. 要求或批准的任何变更都不应使本合同无效；但承包商不得在没有 S.O. 书面变更指令的情况下进行任何变更。',
 'variation',
 ARRAY['written order','VO','变更指令','书面要求'],
 TRUE),

('JKR_203', '31.3',
 'Valuation of Variations',
 '变更的估价',
 'The value of all Variations authorised shall be ascertained by measurement and valuation by the S.O. on the basis of the rates and prices in the Schedule of Rates / Bills of Quantities. Where the character of the work is similar but the conditions are not, a fair valuation shall be made (Star Rate).',
 '所有授权变更的价值应由 S.O. 通过测量和估价确定，估价基础为单价表/工料清单中的费率和价格。当工作性质相似但条件不同时，应进行合理估价（星级单价）。',
 'variation',
 ARRAY['valuation','star rate','schedule of rates','BQ','SMM2','估价','星级单价'],
 TRUE),

('JKR_203', '31.4',
 'Contractor Obligations on Variations',
 '承包商对变更的义务',
 'The Contractor shall, upon receipt of a Variation Order, proceed with such Variation in accordance with the S.O. instructions and shall provide all necessary details and documents for valuation purposes.',
 '承包商在收到变更指令后，应按 S.O. 指示进行变更，并提供估价所需的所有必要细节和文件。',
 'variation',
 ARRAY['contractor obligation','documentation','承包商义务','证明文件'],
 TRUE),

('JKR_203', '31.5',
 'Claim Submission Procedure — 28 Days',
 '索赔提交程序（28天内）',
 'Any claim by the Contractor in respect of additional cost arising from a Variation shall be submitted in writing to the S.O. within twenty-eight (28) days from the date of the Variation Order or the occurrence of the event giving rise to the claim, whichever is later. Failure to comply with this time bar shall entitle the S.O. to reject the claim.',
 '承包商就变更产生的额外费用提出的任何索赔，应在变更指令日期或导致索赔的事件发生之日（以较晚者为准）后二十八（28）天内以书面形式提交给 S.O.。未在此时间限制内提交，S.O. 有权拒绝该索赔。',
 'claim',
 ARRAY['28 days','time bar','claim submission','索赔','28天','时限'],
 TRUE),

-- ── JKR 203 — Clause 32 (Payment) ────────────────────────────────────────
('JKR_203', '32.1',
 'Interim Payment Certificates',
 '中期付款证明',
 'The S.O. shall issue Interim Payment Certificates at intervals not exceeding one (1) month, certifying the amount due to the Contractor based on work properly executed, materials on site, and any other amount due under this Contract.',
 'S.O. 应以不超过一（1）个月的间隔签发中期付款证明，证明根据已正确执行的工程、现场材料以及本合同项下任何其他应付款项，应付承包商的金额。',
 'payment',
 ARRAY['interim payment','monthly','certificate','中期付款','月付'],
 TRUE),

-- ── PAM 2006 — Clause 11 (Variation) ─────────────────────────────────────
('PAM_2006', '11.1',
 'Architect Authority to Order Variation',
 '建筑师授权变更的权力',
 'The Architect may issue Architect''s Instructions requiring a Variation. Such Variation includes addition, omission, or substitution of any work, alteration of the kind or standard of materials or goods, or removal from the site of any work, materials, or goods.',
 '建筑师可以发出要求变更的建筑师指令。此类变更包括任何工程的增加、省略或替换、材料或货物的种类或标准的变更，或从工地移除任何工程、材料或货物。',
 'variation',
 ARRAY['architect instruction','AI','PAM','建筑师指令','变更'],
 TRUE),

('PAM_2006', '11.2',
 'No Variation Without Written Instruction',
 '无书面指令不得变更',
 'No Variation required by the Architect shall be deemed valid unless instructed in writing or subsequently confirmed in writing by the Architect. Verbal instructions shall be confirmed within seven (7) days.',
 '建筑师要求的任何变更，除非以书面形式指示或随后由建筑师以书面形式确认，否则均不应被视为有效。口头指示应在七（7）天内确认。',
 'variation',
 ARRAY['written confirmation','verbal','7 days','书面确认','口头'],
 TRUE),

('PAM_2006', '11.3',
 'Valuation of Variation',
 '变更估价',
 'The value of all Variations shall be ascertained in accordance with the following rules: (a) by the rates in the Contract BQ where work is of similar character and executed under similar conditions; (b) by fair valuation where the work is not similar; (c) by daywork where neither (a) nor (b) applies.',
 '所有变更的价值应按以下规则确定：(a) 当工程性质相似且在相似条件下执行时，按合同 BQ 中的费率；(b) 当工程不相似时，按合理估价；(c) 当 (a) 或 (b) 均不适用时，按日工。',
 'variation',
 ARRAY['valuation','daywork','fair valuation','BQ rates','日工','合理估价'],
 TRUE),

('PAM_2006', '11.4',
 'Variation Procedure and Notice',
 '变更程序与通知',
 'Upon receipt of an Architect''s Instruction, the Contractor shall give notice in writing to the Architect within one (1) month if the Instruction is likely to involve additional cost or extension of time. Failure to do so may prejudice the Contractor''s right to claim.',
 '收到建筑师指令后，如果该指令可能涉及额外费用或工期延长，承包商应在一（1）个月内向建筑师发出书面通知。未能这样做可能损害承包商的索赔权利。',
 'variation',
 ARRAY['notice','1 month','prejudice','EOT','通知','工期延长'],
 TRUE),

-- ── PAM 2018 — Clause 11.1 (Variation) ───────────────────────────────────
('PAM_2018', '11.1',
 'Variation — PAM 2018 Updated Provisions',
 'PAM 2018 变更条款（更新版）',
 'The Architect may issue an Architect''s Instruction requiring a Variation. The valuation of such Variation shall follow the rules under Clause 11.6 (rates in Contract, fair valuation, or daywork). The Contractor shall provide notice of additional cost or time impact within twenty-eight (28) days from the date of the Architect''s Instruction.',
 '建筑师可以发出要求变更的建筑师指令。此类变更的估价应遵循第 11.6 条规则（合同费率、合理估价或日工）。承包商应在建筑师指令日期后二十八（28）天内提供额外费用或时间影响的通知。',
 'variation',
 ARRAY['PAM 2018','28 days','notice','valuation','28天','PAM新版'],
 TRUE)

ON CONFLICT (contract_type, clause_number) DO NOTHING;

COMMIT;

SELECT 'contract_clauses: ' || count(*) || ' rows' AS status FROM contract_clauses;


-- ==============================================================
-- 03_seed_ubbl_provisions.sql
-- ==============================================================
-- Seed: ubbl_provisions
-- Malaysia Uniform Building By-Laws 1984 — key provisions for QS / architect compliance.
-- Parts: V (dimensions), VI (stairs), VII (corridors), VIII (fire), XII (parking), XIII (accessibility)

BEGIN;

INSERT INTO ubbl_provisions
  (part, by_law_number, title, title_cn, content, content_cn, category, numeric_value, unit, verified)
VALUES
-- ── Part V — Space, Light, Ventilation ────────────────────────────────────
('V', '23', 'Minimum Ceiling Height — Habitable Rooms',
 '居住房间最小天花高度',
 'The minimum height of habitable rooms shall be not less than 2.75 metres measured from the finished floor level to the underside of the ceiling.',
 '居住房间的最小高度从完工地面到天花底面不应小于 2.75 米。',
 'dimension', 2.75, 'm', TRUE),

('V', '24', 'Minimum Ceiling Height — Shop / Office',
 '商业/办公空间最小天花高度',
 'Shops, restaurants, offices and similar premises shall have a minimum clear ceiling height of 3.0 metres.',
 '商店、餐厅、办公室及类似场所的最小净天花高度应为 3.0 米。',
 'dimension', 3.0, 'm', TRUE),

('V', '25', 'Minimum Ceiling Height — Kitchen',
 '厨房最小天花高度',
 'A kitchen shall have a minimum clear ceiling height of 2.4 metres.',
 '厨房的最小净天花高度应为 2.4 米。',
 'dimension', 2.4, 'm', TRUE),

('V', '26', 'Minimum Ceiling Height — Bathroom / WC',
 '浴室/卫生间最小天花高度',
 'A bathroom, water-closet, balcony or verandah shall have a minimum clear ceiling height of 2.1 metres.',
 '浴室、卫生间、阳台或走廊的最小净天花高度应为 2.1 米。',
 'dimension', 2.1, 'm', TRUE),

('V', '28', 'Natural Lighting',
 '自然采光',
 'Every habitable room shall be provided with natural lighting by means of windows or other openings, having an aggregate area of not less than 10% of the floor area of such room.',
 '每个居住房间应通过窗户或其他开口提供自然采光，总开口面积不应小于该房间地板面积的 10%。',
 'dimension', 10, '%', TRUE),

('V', '29', 'Natural Ventilation',
 '自然通风',
 'Every habitable room shall be provided with natural ventilation through openings of an aggregate area of not less than 5% of the floor area of such room.',
 '每个居住房间应通过开口提供自然通风，总开口面积不应小于该房间地板面积的 5%。',
 'dimension', 5, '%', TRUE),

-- ── Part VI — Stairs and Lifts ────────────────────────────────────────────
('VI', '35', 'Stair Riser Maximum Height',
 '楼梯踢面最大高度',
 'The maximum height of any riser in a stair shall be 180 mm.',
 '楼梯任何踢面的最大高度应为 180 毫米。',
 'dimension', 180, 'mm', TRUE),

('VI', '36', 'Stair Tread Minimum Width',
 '楼梯踏面最小宽度',
 'The minimum width of any tread in a stair shall be 255 mm.',
 '楼梯任何踏面的最小宽度应为 255 毫米。',
 'dimension', 255, 'mm', TRUE),

('VI', '37', 'Residential Stair Minimum Width',
 '住宅楼梯最小宽度',
 'The minimum clear width of a stair in a residential building shall be 1.0 metre.',
 '住宅建筑中楼梯的最小净宽度应为 1.0 米。',
 'dimension', 1.0, 'm', TRUE),

('VI', '38', 'Public Stair Minimum Width',
 '公共楼梯最小宽度',
 'The minimum clear width of a stair in a public building shall be 1.5 metres.',
 '公共建筑中楼梯的最小净宽度应为 1.5 米。',
 'dimension', 1.5, 'm', TRUE),

('VI', '39', 'Maximum Continuous Risers Per Flight',
 '每梯段最大连续踢面数',
 'No flight of stairs shall contain more than 16 continuous risers without an intermediate landing.',
 '任何楼梯段在没有中间平台的情况下，连续踢面数不应超过 16 级。',
 'dimension', 16, 'storey', TRUE),

('VI', '40', 'Stair Handrail Minimum Height',
 '楼梯栏杆最小高度',
 'Every stair shall be provided with a handrail of a height not less than 1.0 metre measured vertically from the centre of the tread.',
 '每个楼梯应配备栏杆，从踏面中心垂直测量，高度不应小于 1.0 米。',
 'dimension', 1.0, 'm', TRUE),

-- ── Part VII — Corridors and Means of Egress ─────────────────────────────
('VII', '41', 'Residential Corridor Minimum Width',
 '住宅走廊最小宽度',
 'The minimum clear width of any corridor in a residential building shall be 1.0 metre.',
 '住宅建筑中任何走廊的最小净宽度应为 1.0 米。',
 'dimension', 1.0, 'm', TRUE),

('VII', '42', 'Public Building Corridor Minimum Width',
 '公共建筑走廊最小宽度',
 'The minimum clear width of any corridor in a public building shall be 1.5 metres.',
 '公共建筑中任何走廊的最小净宽度应为 1.5 米。',
 'dimension', 1.5, 'm', TRUE),

-- ── Part VIII — Fire Requirements ────────────────────────────────────────
('VIII', '45', 'Maximum Travel Distance — No Sprinkler',
 '无喷淋最大疏散距离',
 'The maximum travel distance from any point in a building to the nearest exit, in a building without an automatic sprinkler system, shall be 18 metres.',
 '在没有自动喷淋系统的建筑中，从建筑物内任何一点到最近出口的最大行进距离应为 18 米。',
 'fire', 18, 'm', TRUE),

('VIII', '46', 'Maximum Travel Distance — With Sprinkler',
 '有喷淋最大疏散距离',
 'The maximum travel distance from any point in a building to the nearest exit, in a building with an automatic sprinkler system, shall be 36 metres.',
 '在具有自动喷淋系统的建筑中，从建筑物内任何一点到最近出口的最大行进距离应为 36 米。',
 'fire', 36, 'm', TRUE),

('VIII', '47', 'Fire Door Rating',
 '防火门额定值',
 'A fire door separating a protected route from any other part of a building shall have a minimum fire resistance of 1 hour.',
 '分隔受保护通道与建筑其他部分的防火门，最小耐火极限应为 1 小时。',
 'fire', 1, 'hour', TRUE),

('VIII', '48', 'Fire Escape Minimum Width',
 '消防通道最小宽度',
 'The minimum clear width of any fire escape route shall be 1.1 metres.',
 '任何消防疏散通道的最小净宽度应为 1.1 米。',
 'fire', 1.1, 'm', TRUE),

('VIII', '49', 'Two Staircases Required for High-Rise',
 '高层建筑需要两个楼梯',
 'A building exceeding four storeys in height shall be provided with at least two independent and remote staircases serving each storey.',
 '超过四层的建筑应至少配备两个独立且分离的楼梯为每层服务。',
 'fire', 2, 'staircase', TRUE),

-- ── Part XII — Parking ───────────────────────────────────────────────────
('XII', '80', 'Residential Parking Ratio',
 '住宅停车比例',
 'For each residential unit, a minimum of one (1) car parking space shall be provided.',
 '每个住宅单元应至少提供一（1）个停车位。',
 'parking', 1, 'space', TRUE),

('XII', '81', 'Commercial Parking Ratio',
 '商业停车比例',
 'For commercial premises, a minimum of one (1) car parking space shall be provided for every 25 square metres of net floor area.',
 '商业场所每 25 平方米净楼面应至少提供一（1）个停车位。',
 'parking', 25, 'm2', TRUE),

('XII', '82', 'Standard Parking Space Dimensions',
 '标准停车位尺寸',
 'Each car parking space shall have minimum dimensions of 2.5 metres width by 5.0 metres length.',
 '每个停车位的最小尺寸应为宽 2.5 米、长 5.0 米。',
 'parking', 12.5, 'm2', TRUE),

('XII', '83', 'Disabled Parking Ratio',
 '无障碍停车比例',
 'At least 2% of all car parking spaces shall be designated for use by persons with disabilities, with a minimum of one (1) such space.',
 '所有停车位中至少 2% 应指定供残障人士使用，最少为一（1）个。',
 'parking', 2, '%', TRUE),

-- ── Part XIII — Accessibility ────────────────────────────────────────────
('XIII', '87', 'Accessibility Provision',
 '无障碍通道规定',
 'Every public building shall be designed and constructed to provide reasonable means of access and use for persons with disabilities, in accordance with MS 1184 and MS 1331.',
 '每个公共建筑应按照 MS 1184 和 MS 1331 的规定，设计和建造以提供残障人士合理的进出和使用方式。',
 'access', NULL, NULL, TRUE),

('XIII', '88', 'Wheelchair Ramp Gradient',
 '轮椅坡道坡度',
 'A wheelchair ramp shall have a maximum gradient of 1:12 (8.3%), with handrails on both sides.',
 '轮椅坡道的最大坡度应为 1:12（8.3%），两侧应配备扶手。',
 'access', 0.0833, 'ratio', TRUE)

ON CONFLICT (part, by_law_number) DO NOTHING;

COMMIT;

SELECT 'ubbl_provisions: ' || count(*) || ' rows' AS status FROM ubbl_provisions;


-- ==============================================================
-- 04_seed_ms_standards.sql
-- ==============================================================
-- Seed: ms_standards
-- 19 Malaysian Standards commonly referenced in JKR / SMM2 specifications.
-- Year and exact title kept where known; older revisions marked verified=FALSE.

BEGIN;

INSERT INTO ms_standards
  (standard_number, title, title_cn, category, scope, year, verified)
VALUES
-- Cement
('MS 522', 'Specification for Portland Cement (Ordinary and Rapid-hardening)',
 '波特兰水泥规范（普通和快硬）', 'cement',
 'Composition, specifications and conformity criteria for common cements.', 2007, TRUE),

('MS 523', 'Specification for Rapid-hardening Portland Cement',
 '快硬波特兰水泥规范', 'cement',
 'Higher early-strength variant of Portland cement.', 2003, FALSE),

('MS 1227', 'Composite Cement — Specification',
 '复合水泥规范', 'cement',
 'Blended cements containing pozzolanic or slag additions.', 2004, FALSE),

-- Steel
('MS 146', 'Specification for Hot-rolled Steel Bars for the Reinforcement of Concrete',
 '混凝土钢筋热轧钢筋规范', 'steel',
 'Specification for ribbed reinforcement bars (Grade 500).', 2014, TRUE),

('MS 755', 'Specification for Structural Steel — Hot Rolled Sections',
 '结构钢规范（热轧型材）', 'steel',
 'I-beams, channels, angles for structural use.', 2001, FALSE),

-- Masonry
('MS 76', 'Specification for Bricks and Blocks of Fired Brickearth, Clay or Shale',
 '砖块规范（黏土/页岩）', 'masonry',
 'Common red clay bricks for masonry construction.', 1972, FALSE),

('MS 27', 'Specification for Hollow and Solid Non-Load-Bearing Concrete Masonry Units',
 '非承重混凝土砌块规范', 'masonry',
 'Hollow and solid concrete blocks for partition walls.', 2005, FALSE),

('MS 771', 'Specification for Ceramic Floor and Wall Tiles',
 '陶瓷地砖墙砖规范', 'masonry',
 'Glazed and unglazed ceramic tiles for floors and walls.', 2000, FALSE),

-- Concrete
('MS 1064', 'Concrete — Specification, Performance, Production and Conformity',
 '混凝土规范、性能、生产与符合性', 'concrete',
 'Adopted from EN 206 — concrete strength classes and exposure.', 2014, TRUE),

-- Fire
('MS 1195', 'Code of Practice for Fire Precautions in the Design and Construction of Buildings',
 '建筑设计与施工防火规范', 'fire',
 'Performance-based fire safety design framework.', 2000, FALSE),

('MS 1776', 'Code of Practice for the Design, Installation, Commissioning and Maintenance of Automatic Fire Detection and Alarm Systems',
 '自动火灾探测和警报系统规范', 'fire',
 'Automatic fire detection and alarm system requirements.', 2005, FALSE),

-- Structural Loading
('MS 1553', 'Code of Practice on Wind Loading for Building Structure',
 '建筑结构风荷载规范', 'structural',
 'Wind load calculations for buildings in Malaysian climate.', 2002, TRUE),

('MS 1194', 'Specification for Steel Reinforcement Concrete — Welded Steel Fabric (Mesh)',
 '焊接钢筋网规范', 'steel',
 'Welded wire mesh for slab reinforcement.', 1991, FALSE),

('MS 1889', 'Code of Practice for the Seismic Design of Concrete Buildings',
 '混凝土建筑抗震设计规范', 'structural',
 'Seismic design provisions adopted post-2004.', 2018, FALSE),

-- Timber
('MS 544', 'Code of Practice for the Structural Use of Timber',
 '木结构使用规范', 'timber',
 'Multi-part code covering grading, design, fasteners.', 2001, FALSE),

-- Plumbing / MEP
('MS 1057', 'Specification for Polyethylene Pipes for Water Supply',
 '聚乙烯供水管规范', 'mep',
 'PE pipes for potable water under pressure.', 2002, FALSE),

('MS 1426', 'Code of Practice for Sewerage and Drainage Pipes — UPVC',
 '排水管 UPVC 规范', 'mep',
 'Unplasticised PVC pipes for sewerage and drainage.', 1995, FALSE),

-- Electrical
('MS 1775', 'Code of Practice for the Application of Insulation Coordination in Electrical Power Systems',
 '电气系统绝缘配合规范', 'electrical',
 'Coordination between insulation and surge protection.', 2005, FALSE),

('MS 1937', 'Code of Practice for the Protection of Buildings Against Lightning',
 '建筑物防雷规范', 'electrical',
 'Lightning protection system design.', 2007, FALSE),

-- Geotechnical
('MS 1377', 'Code of Practice for Site Investigation — Methods of Test for Soils for Civil Engineering Purposes',
 '土壤工程测试方法规范', 'geotechnical',
 'Soil testing methods for foundation design.', 1992, FALSE)

ON CONFLICT (standard_number) DO NOTHING;

COMMIT;

SELECT 'ms_standards: ' || count(*) || ' rows' AS status FROM ms_standards;


-- ==============================================================
-- 05_seed_vo_templates.sql
-- ==============================================================
-- Seed: vo_templates
-- 3 templates with bilingual content + JSONB field definitions.

BEGIN;

INSERT INTO vo_templates
  (template_type, contract_type, title, title_cn, content, content_cn, fields, verified)
VALUES
-- ── 1. Request Letter ──────────────────────────────────────────────────
('request_letter', 'JKR_203',
 'Variation Order Request Letter',
 '变更指令申请函',
 -- content_en (markdown with placeholders)
 E'**To:** {{so_name}}, Superintending Officer\n**From:** {{contractor_name}}\n**Project:** {{project_name}}\n**Date:** {{date}}\n**Reference:** {{vo_reference}}\n\nDear Sir,\n\n**Subject: Application for Variation Order — {{vo_title}}**\n\nWith reference to the above project and pursuant to Clause 31 of the JKR 203 Contract, we hereby formally apply for a Variation Order in respect of the following:\n\n**1. Description of Variation:**\n{{vo_description}}\n\n**2. Justification:**\n{{vo_justification}}\n\n**3. Estimated Cost Impact:** RM {{estimated_cost}}\n**4. Estimated Time Impact:** {{eot_days}} days\n\nWe enclose the detailed cost breakdown and supporting documents for your evaluation. Kindly issue a written Variation Order to authorise the works.\n\nYours faithfully,\n\n_______________________\n{{contractor_signatory}}\n{{contractor_company}}',
 -- content_cn
 E'**致：** {{so_name}}，监督员\n**自：** {{contractor_name}}\n**项目：** {{project_name}}\n**日期：** {{date}}\n**参考编号：** {{vo_reference}}\n\n敬启者：\n\n**主题：变更指令申请 — {{vo_title}}**\n\n参照上述项目，并根据 JKR 203 合约第 31 条规定，我方正式申请就以下事项发出变更指令：\n\n**1. 变更描述：**\n{{vo_description}}\n\n**2. 理由：**\n{{vo_justification}}\n\n**3. 预估费用影响：** 马币 {{estimated_cost}}\n**4. 预估工期影响：** {{eot_days}} 天\n\n随附详细费用拆分及佐证文件以供评估。请发出书面变更指令授权进行该等工作。\n\n此致\n\n_______________________\n{{contractor_signatory}}\n{{contractor_company}}',
 -- fields JSONB
 '[
   {"name":"so_name","label":"S.O. Name","type":"text","required":true},
   {"name":"contractor_name","label":"Contractor Name","type":"text","required":true},
   {"name":"project_name","label":"Project Name","type":"text","required":true},
   {"name":"date","label":"Date","type":"date","required":true},
   {"name":"vo_reference","label":"VO Reference No.","type":"text","required":true},
   {"name":"vo_title","label":"Variation Title","type":"text","required":true},
   {"name":"vo_description","label":"Description","type":"textarea","required":true},
   {"name":"vo_justification","label":"Justification","type":"textarea","required":true},
   {"name":"estimated_cost","label":"Estimated Cost (RM)","type":"number","required":true},
   {"name":"eot_days","label":"EOT (days)","type":"number","required":false},
   {"name":"contractor_signatory","label":"Signatory","type":"text","required":true},
   {"name":"contractor_company","label":"Company","type":"text","required":true}
 ]'::jsonb,
 TRUE),

-- ── 2. Cost Breakdown ──────────────────────────────────────────────────
('cost_breakdown', 'JKR_203',
 'Variation Order Cost Breakdown',
 '变更指令费用拆分表',
 E'**VO Cost Breakdown — {{vo_reference}}**\n\n| Item | Description | Unit | Qty | Rate (RM) | Amount (RM) | Source |\n|------|-------------|------|-----|-----------|-------------|--------|\n| {{items_table}} |\n\n**Sub-total:** RM {{subtotal}}\n**Preliminaries (% as per BQ):** RM {{preliminaries}}\n**Overheads & Profit (10%):** RM {{ohp}}\n**Contingency ({{contingency_pct}}%):** RM {{contingency}}\n\n**Total VO Value:** RM {{total}}\n\n**Notes:**\n- Rates derived from Contract BQ Section {{bq_section}} where applicable.\n- Star rates marked with [*] are subject to S.O. negotiation per Clause 31.3.\n- All quantities measured per SMM2.',
 E'**变更指令费用拆分 — {{vo_reference}}**\n\n| 项 | 描述 | 单位 | 数量 | 单价 (RM) | 金额 (RM) | 来源 |\n|----|------|------|------|-----------|-----------|------|\n| {{items_table}} |\n\n**小计：** 马币 {{subtotal}}\n**前期工程（按BQ百分比）：** 马币 {{preliminaries}}\n**间接费及利润（10%）：** 马币 {{ohp}}\n**应急费用（{{contingency_pct}}%）：** 马币 {{contingency}}\n\n**变更总额：** 马币 {{total}}\n\n**备注：**\n- 单价来自合约BQ第 {{bq_section}} 节（如适用）。\n- 标记 [*] 的星级单价需按第31.3条与S.O.协商。\n- 所有数量按SMM2计量。',
 '[
   {"name":"vo_reference","label":"VO Reference","type":"text","required":true},
   {"name":"items_table","label":"Line Items (markdown rows)","type":"textarea","required":true},
   {"name":"subtotal","label":"Sub-total (RM)","type":"number","required":true},
   {"name":"preliminaries","label":"Preliminaries (RM)","type":"number","required":false},
   {"name":"ohp","label":"O&P (RM)","type":"number","required":false},
   {"name":"contingency_pct","label":"Contingency %","type":"number","required":false},
   {"name":"contingency","label":"Contingency (RM)","type":"number","required":false},
   {"name":"total","label":"Total (RM)","type":"number","required":true},
   {"name":"bq_section","label":"BQ Section","type":"text","required":false}
 ]'::jsonb,
 TRUE),

-- ── 3. Approval Form ───────────────────────────────────────────────────
('approval_form', 'JKR_203',
 'Variation Order Approval Form',
 '变更指令批准表',
 E'# VARIATION ORDER APPROVAL — {{vo_reference}}\n\n**Project:** {{project_name}}\n**Contract No.:** {{contract_no}}\n**Date:** {{date}}\n\n## 1. Particulars\n- **VO Title:** {{vo_title}}\n- **Description:** {{vo_description}}\n- **Reason for Variation:** {{reason}}\n\n## 2. Financial Impact\n- **Contract Sum:** RM {{contract_sum}}\n- **This VO Value:** RM {{vo_value}}\n- **Cumulative VO to date:** RM {{cumulative_vo}}\n- **Revised Contract Sum:** RM {{revised_sum}}\n- **% Variation:** {{vo_pct}}%\n\n## 3. Time Impact\n- **Original Completion:** {{original_date}}\n- **EOT Granted:** {{eot_days}} days\n- **Revised Completion:** {{revised_date}}\n\n## 4. Approvals\n\n| Role | Name | Signature | Date |\n|------|------|-----------|------|\n| Quantity Surveyor | {{qs_name}} | | |\n| Project Director | {{pd_name}} | | |\n| Superintending Officer | {{so_name}} | | |\n| Client Representative | {{client_name}} | | |\n\n## 5. Authorisation Note\nThis Variation is issued pursuant to Clause 31 of the JKR 203 Contract and shall be valued in accordance with Clause 31.3.',
 E'# 变更指令批准表 — {{vo_reference}}\n\n**项目：** {{project_name}}\n**合约编号：** {{contract_no}}\n**日期：** {{date}}\n\n## 1. 详情\n- **变更标题：** {{vo_title}}\n- **描述：** {{vo_description}}\n- **变更原因：** {{reason}}\n\n## 2. 财务影响\n- **合约总额：** 马币 {{contract_sum}}\n- **本变更金额：** 马币 {{vo_value}}\n- **累计变更：** 马币 {{cumulative_vo}}\n- **修订后合约总额：** 马币 {{revised_sum}}\n- **变更百分比：** {{vo_pct}}%\n\n## 3. 工期影响\n- **原完工日期：** {{original_date}}\n- **延长工期：** {{eot_days}} 天\n- **修订后完工日期：** {{revised_date}}\n\n## 4. 批准\n\n| 职位 | 姓名 | 签名 | 日期 |\n|------|------|------|------|\n| 工料测量师 | {{qs_name}} | | |\n| 项目总监 | {{pd_name}} | | |\n| 监督员 | {{so_name}} | | |\n| 业主代表 | {{client_name}} | | |\n\n## 5. 授权声明\n本变更根据 JKR 203 合约第 31 条发出，并按第 31.3 条进行估价。',
 '[
   {"name":"vo_reference","label":"VO No.","type":"text","required":true},
   {"name":"project_name","label":"Project","type":"text","required":true},
   {"name":"contract_no","label":"Contract No.","type":"text","required":true},
   {"name":"date","label":"Date","type":"date","required":true},
   {"name":"vo_title","label":"Title","type":"text","required":true},
   {"name":"vo_description","label":"Description","type":"textarea","required":true},
   {"name":"reason","label":"Reason","type":"textarea","required":true},
   {"name":"contract_sum","label":"Contract Sum (RM)","type":"number","required":true},
   {"name":"vo_value","label":"This VO (RM)","type":"number","required":true},
   {"name":"cumulative_vo","label":"Cumulative VO (RM)","type":"number","required":true},
   {"name":"revised_sum","label":"Revised Sum (RM)","type":"number","required":true},
   {"name":"vo_pct","label":"% Variation","type":"number","required":true},
   {"name":"original_date","label":"Original Completion","type":"date","required":true},
   {"name":"eot_days","label":"EOT (days)","type":"number","required":false},
   {"name":"revised_date","label":"Revised Completion","type":"date","required":false},
   {"name":"qs_name","label":"QS","type":"text","required":true},
   {"name":"pd_name","label":"Project Director","type":"text","required":true},
   {"name":"so_name","label":"S.O.","type":"text","required":true},
   {"name":"client_name","label":"Client Rep","type":"text","required":true}
 ]'::jsonb,
 TRUE);

COMMIT;

SELECT 'vo_templates: ' || count(*) || ' rows' AS status FROM vo_templates;


-- ==============================================================
-- 06_seed_measurement_codes.sql
-- ==============================================================
-- Seed: measurement_codes
-- SMM2 (Standard Method of Measurement 2nd ed.) sections A-X + NRM elements 1-9.

BEGIN;

INSERT INTO measurement_codes
  (system, section_code, title, title_cn, description, description_cn, verified)
VALUES
-- ── SMM2 — 24 sections A-X ─────────────────────────────────────────────
('SMM2', 'A', 'Preliminaries / General Conditions',
 '前期工程／一般条件',
 'Project-wide costs: site overheads, insurances, performance bonds, contractor''s preliminaries.',
 '项目级费用：现场间接费、保险、履约保证金、承包商前期工程。',
 TRUE),

('SMM2', 'B', 'Demolition, Alteration, Renovation',
 '拆除、改建、翻新',
 'Demolition of existing structures, alterations to retained portions, renovation works.',
 '现有结构的拆除、保留部分的改建、翻新工程。',
 TRUE),

('SMM2', 'C', 'Groundwork',
 '土方工程',
 'Site clearance, excavation, earthwork support, filling, surface treatments.',
 '场地清理、挖掘、土方支护、填充、表面处理。',
 TRUE),

('SMM2', 'D', 'Piling',
 '打桩工程',
 'Driven piles, bored piles, pile caps, dynamic / static load tests.',
 '打入桩、钻孔桩、桩帽、动／静载试验。',
 TRUE),

('SMM2', 'E', 'In-situ Concrete',
 '现浇混凝土',
 'Concrete cast in formwork on site: foundations, slabs, columns, beams.',
 '现场模板内浇筑的混凝土：基础、楼板、柱、梁。',
 TRUE),

('SMM2', 'F', 'Reinforcement / Formwork',
 '钢筋／模板',
 'Steel reinforcement bars and mesh, formwork to concrete elements.',
 '钢筋钢条及钢筋网、混凝土构件模板。',
 TRUE),

('SMM2', 'G', 'Brickwork / Blockwork',
 '砖砌／砌块工程',
 'Brick and block masonry, including DPC, ties, and lintels.',
 '砖块和混凝土砌块砌筑，包括防潮层、拉结筋、过梁。',
 TRUE),

('SMM2', 'H', 'Stonework',
 '石材工程',
 'Natural stone facing, paving, copings, and architectural features.',
 '天然石材饰面、铺装、压顶及建筑装饰。',
 TRUE),

('SMM2', 'J', 'Asphalt Work / Tanking',
 '沥青／防水工程',
 'Mastic asphalt floors, roofs, tanking; bitumen damp-proofing.',
 '沥青地板、屋顶、防水罩；沥青防潮。',
 TRUE),

('SMM2', 'K', 'Roofing',
 '屋顶工程',
 'Roof coverings (tiles, slates, metal), insulation, gutters, downpipes.',
 '屋顶覆盖物（瓦片、石板瓦、金属）、保温、檐沟、雨水管。',
 TRUE),

('SMM2', 'L', 'Carpentry / Timber',
 '木工工程',
 'Structural timber, joinery, doors, windows, finishings in timber.',
 '结构木材、木工、门窗、木质饰面。',
 TRUE),

('SMM2', 'M', 'Plasterwork / Tile Finishes',
 '抹灰／瓷砖饰面',
 'Internal/external rendering, plaster, tile floors and walls.',
 '内外抹灰、批荡、地砖墙砖。',
 TRUE),

('SMM2', 'N', 'Painting / Decorating',
 '油漆／装饰',
 'Surface preparation, paint, wallpaper, varnishes.',
 '表面处理、油漆、墙纸、清漆。',
 TRUE),

('SMM2', 'P', 'Glazing',
 '玻璃工程',
 'Glass to windows, doors, partitions, including frames and seals.',
 '门窗、隔断玻璃，包括框架和密封。',
 TRUE),

('SMM2', 'Q', 'Metalwork',
 '金属工程',
 'Steel sections, handrails, gates, gratings, decorative metalwork.',
 '钢型材、扶手、闸门、格栅、装饰金属件。',
 TRUE),

('SMM2', 'R', 'Sundries / Sundry Works',
 '杂项工程',
 'Items not falling neatly into other sections — typically project-specific.',
 '不属于其他章节的杂项 — 通常项目特定。',
 TRUE),

('SMM2', 'S', 'Drainage',
 '排水工程',
 'Foul and surface water drainage, manholes, septic tanks.',
 '污水和雨水排水、检查井、化粪池。',
 TRUE),

('SMM2', 'T', 'Plumbing / Sanitary Fittings',
 '管道／卫生洁具',
 'Water supply pipework, sanitary fittings (WC, basins, sinks).',
 '给水管道、卫生洁具（坐厕、洗手盆、水槽）。',
 TRUE),

('SMM2', 'U', 'Mechanical Services',
 '机械服务',
 'HVAC, ventilation, mechanical handling, lifts.',
 '暖通空调、通风、机械搬运、电梯。',
 TRUE),

('SMM2', 'V', 'Electrical Services',
 '电气服务',
 'Power distribution, lighting, conduits, switchgear, low voltage systems.',
 '电力分配、照明、线管、开关设备、低压系统。',
 TRUE),

('SMM2', 'W', 'External Works',
 '外部工程',
 'Roads, pavements, fencing, landscaping outside the building footprint.',
 '建筑外占地范围以外的道路、人行道、围栏、景观。',
 TRUE),

('SMM2', 'X', 'Contingencies / Provisional Sums',
 '应急费用／暂列金额',
 'PC sums, provisional sums, contingency reserves.',
 'PC 款、暂列金、应急储备。',
 TRUE),

-- ── NRM (New Rules of Measurement) — 9 main elements ──────────────────
('NRM', '1', 'Substructure',
 '地下结构',
 'Foundations, basements, work below lowest floor.',
 '基础、地下室、最低层楼以下的工程。',
 TRUE),

('NRM', '2', 'Superstructure',
 '上部结构',
 'Frame, upper floors, roof, stairs, external walls, windows, doors, internal walls.',
 '框架、上层楼板、屋顶、楼梯、外墙、窗户、门、内墙。',
 TRUE),

('NRM', '3', 'Internal Finishes',
 '室内饰面',
 'Floor, wall, ceiling finishes inside the building.',
 '建筑物内地面、墙面、天花饰面。',
 TRUE),

('NRM', '4', 'Fittings, Furnishings, Equipment',
 '固定家具、装饰、设备',
 'Built-in fittings, loose furniture, specialist equipment.',
 '内置家具、活动家具、专用设备。',
 TRUE),

('NRM', '5', 'Services',
 '机电服务',
 'Sanitary, M&E services, BWIC (builders work in connection).',
 '卫生、机电服务、机电相关土建工程。',
 TRUE),

('NRM', '6', 'Complete Buildings and Building Units',
 '整体建筑及建筑单元',
 'Pre-fabricated complete units (e.g. modular pods).',
 '预制整体单元（例如模块化舱体）。',
 TRUE),

('NRM', '7', 'Work to Existing Building',
 '现有建筑施工',
 'Demolition, alteration, additions, repairs to existing structures.',
 '现有结构的拆除、改建、扩建、维修。',
 TRUE),

('NRM', '8', 'External Works',
 '外部工程',
 'Site works outside the building footprint — landscaping, roads, drainage.',
 '建筑外占地范围以外的工程 — 景观、道路、排水。',
 TRUE),

('NRM', '9', 'Facilitating Works',
 '配套工程',
 'Site clearance, hazardous material removal, ground stabilisation.',
 '场地清理、危险材料清除、地基稳定。',
 TRUE)

ON CONFLICT (system, section_code) DO NOTHING;

COMMIT;

SELECT 'measurement_codes: ' || count(*) || ' rows' AS status FROM measurement_codes;


-- ==============================================================
-- 07_seed_bim_regulations.sql
-- ==============================================================
-- Seed: bim_regulations
-- 8 Malaysian construction/BIM policies. Dates and thresholds set where known.

BEGIN;

INSERT INTO bim_regulations
  (regulation_type, title, title_cn, issuing_body, document_number, effective_date, value_threshold, currency, scope, scope_cn, verified)
VALUES
('plan', 'BIM Strategic Plan 2016',
 'BIM 战略计划 2016',
 'CIDB Malaysia', 'CIDB-BIM-2016', '2016-01-01', NULL, NULL,
 'CIDB strategic roadmap for BIM adoption across the Malaysian construction industry.',
 'CIDB 关于推进 BIM 在马来西亚建筑业应用的战略路线图。',
 TRUE),

('plan', 'Construction Industry Transformation Programme (CITP 2016-2020)',
 '建筑业转型计划 2016-2020',
 'CIDB Malaysia', 'CITP-2016-2020', '2015-09-10', NULL, NULL,
 'Five-year transformation plan covering productivity, quality, professionalism, environmental sustainability and internationalisation.',
 '为期五年的转型计划，涵盖生产力、品质、专业精神、环境永续性和国际化。',
 TRUE),

('plan', '11th Malaysia Plan (11MP) — Construction Sector',
 '第十一个马来西亚计划 — 建筑业',
 'EPU Malaysia', '11MP-2016', '2016-01-01', NULL, NULL,
 'Government five-year plan setting GDP and industry targets for construction (2016-2020).',
 '政府五年计划，制定建筑业 GDP 和行业目标（2016-2020）。',
 TRUE),

('mandate', 'JKR / Government BIM Mandate — Projects > RM 100 million',
 'JKR / 政府 BIM 强制令 — 项目 > RM 100M',
 'JKR / Treasury', 'JKR-BIM-MANDATE-2017', '2017-01-01', 100000000, 'MYR',
 'All government construction projects above RM 100 million must adopt BIM. Initial mandate phase.',
 '所有 1 亿令吉以上的政府建筑项目必须采用 BIM。强制令第一阶段。',
 TRUE),

('mandate', 'JKR / Government BIM Mandate — Projects > RM 50 million',
 'JKR / 政府 BIM 强制令 — 项目 > RM 50M',
 'JKR / Treasury', 'JKR-BIM-MANDATE-2019', '2019-01-01', 50000000, 'MYR',
 'Expanded BIM mandate — threshold lowered to RM 50 million effective 2019.',
 '扩大的 BIM 强制令 — 自 2019 年起门槛降至 5000 万令吉。',
 TRUE),

('mandate', 'IBS Score Mandate — Government Projects',
 'IBS 评分强制令 — 政府项目',
 'CIDB Malaysia', 'IBS-GOVT-2010', '2010-01-01', NULL, NULL,
 'Government building projects must achieve a minimum IBS Score of 50 to encourage industrialised building systems.',
 '政府建筑项目必须达到至少 50 分的 IBS 评分，以鼓励工业化建筑系统。',
 TRUE),

('mandate', 'IBS Score Mandate — Private Sector Buildings > 5,000 sqm',
 'IBS 评分强制令 — 私人建筑 > 5,000 平方米',
 'CIDB Malaysia', 'IBS-PRIVATE-2020', '2020-01-01', NULL, NULL,
 'Private buildings with gross floor area exceeding 5,000 sqm must comply with minimum IBS scoring requirements.',
 '总建筑面积超过 5,000 平方米的私人建筑必须符合最低 IBS 评分要求。',
 TRUE),

('act', 'Lembaga Pembangunan Industri Pembinaan Malaysia Act 1994 (Act 520)',
 '马来西亚建筑工业发展委员会法令 1994 (Act 520)',
 'Parliament of Malaysia', 'ACT_520', '1994-07-01', NULL, NULL,
 'Establishes CIDB and provides for the development and regulation of the Malaysian construction industry, including levy provisions.',
 '设立 CIDB，并就马来西亚建筑业的发展和监管作出规定，包括征费条款。',
 TRUE)

ON CONFLICT DO NOTHING;

COMMIT;

SELECT 'bim_regulations: ' || count(*) || ' rows' AS status FROM bim_regulations;


-- ==============================================================
-- 08_seed_competitor_pricing.sql
-- ==============================================================
-- Seed: competitor_pricing
-- 12 competitor SKUs. Prices are ESTIMATED MYR equivalents — pricing changes often,
-- all marked verified=FALSE. Always cross-check vendor websites before quoting.

BEGIN;

INSERT INTO competitor_pricing
  (competitor_name, product_name, pricing_model, price_myr, billing_period, features, region, notes, verified)
VALUES
-- ── CostX (RIB / Exactal) ─────────────────────────────────────────────
('Exactal CostX', 'CostX Monthly Subscription',
 'subscription_monthly', 1800, 'month',
 ARRAY['2D takeoff','3D BIM takeoff','BQ generation','Revit / IFC import','workbook output'],
 'Malaysia',
 'Estimated MYR equivalent of USD ~400/month for standard Estimating + BIM Viewer bundle.',
 FALSE),

('Exactal CostX', 'CostX Annual Subscription',
 'subscription_annual', 18000, 'year',
 ARRAY['2D takeoff','3D BIM takeoff','BQ generation','Revit / IFC import','workbook output','priority support'],
 'Malaysia',
 'Annual subscription typically offers ~15% discount vs monthly.',
 FALSE),

-- ── Cubicost (Glodon) ─────────────────────────────────────────────────
('Glodon Cubicost', 'Cubicost TAS (Architectural)',
 'subscription_annual', 8000, 'year',
 ARRAY['architectural takeoff','BIM model integration','Chinese SMM','Malaysian BQ template'],
 'Malaysia',
 'Architectural module standalone — quantity takeoff for archi elements.',
 FALSE),

('Glodon Cubicost', 'Cubicost TME (MEP)',
 'subscription_annual', 8000, 'year',
 ARRAY['MEP takeoff','duct/pipe routing','BIM integration'],
 'Malaysia',
 'MEP (mechanical/electrical/plumbing) module.',
 FALSE),

('Glodon Cubicost', 'Cubicost TPS (Structural)',
 'subscription_annual', 8000, 'year',
 ARRAY['structural takeoff','rebar detail','concrete schedule'],
 'Malaysia',
 'Structural module — rebar and concrete focused.',
 FALSE),

('Glodon Cubicost', 'Cubicost Full Suite (TAS+TME+TPS)',
 'subscription_annual', 20000, 'year',
 ARRAY['full discipline coverage','suite discount','training','support'],
 'Malaysia',
 'Bundled suite — discounted vs buying modules separately.',
 FALSE),

-- ── Cubit (Buildsoft) ─────────────────────────────────────────────────
('Buildsoft Cubit', 'Cubit Basic',
 'subscription_annual', 5500, 'year',
 ARRAY['2D takeoff','basic estimating','PDF markup','Excel export'],
 'Malaysia',
 'Entry-level digital takeoff — popular among Australian and Asian SMEs.',
 FALSE),

('Buildsoft Cubit', 'Cubit Pro',
 'subscription_annual', 9500, 'year',
 ARRAY['2D + 3D takeoff','advanced estimating','custom templates','tender management'],
 'Malaysia',
 'Pro tier adds 3D and tender workflow features.',
 FALSE),

-- ── Bluebeam Revu ─────────────────────────────────────────────────────
('Bluebeam Revu', 'Revu Standard',
 'subscription_annual', 1400, 'year',
 ARRAY['PDF markup','measurement','collaboration (Studio)','basic takeoff'],
 'Malaysia',
 'Industry-standard PDF tool used heavily by QS firms for markup and basic takeoff.',
 FALSE),

('Bluebeam Revu', 'Revu CAD',
 'subscription_annual', 2200, 'year',
 ARRAY['everything in Standard','AutoCAD integration','Revit plugin','enhanced markup'],
 'Malaysia',
 'CAD tier adds direct AutoCAD / Revit integration.',
 FALSE),

-- ── Procore ───────────────────────────────────────────────────────────
('Procore Technologies', 'Procore Construction Management',
 'subscription_annual', 50000, 'year',
 ARRAY['project management','financials','field productivity','BIM viewer','dRofus integration'],
 'Malaysia',
 'Enterprise PM platform — price varies massively by project volume. Estimate is for mid-sized firm.',
 FALSE),

-- ── Buildxact ─────────────────────────────────────────────────────────
('Buildxact', 'Buildxact (SME Estimating + PM)',
 'subscription_monthly', 700, 'month',
 ARRAY['takeoff','estimating','project management','client portal'],
 'Malaysia',
 'Aimed at small builders / SME contractors. Cloud-based, simpler than CostX.',
 FALSE);

COMMIT;

SELECT 'competitor_pricing: ' || count(*) || ' rows' AS status FROM competitor_pricing;


-- ==============================================================
-- 09_seed_qs_companies.sql
-- ==============================================================
-- Seed: qs_companies
-- 15 Klang Valley QS firms — beta user prospect list.
-- IMPORTANT: All entries seeded with verified=FALSE and NO contact details (NULL).
-- Treat this as a STARTER TEMPLATE — replace placeholder names + research real contacts
-- before reaching out. Names like "Klang Valley QS Partners X" are intentional placeholders
-- you should replace with actual prospects.

BEGIN;

INSERT INTO qs_companies
  (company_name, location, website, estimated_size, services, contact_person, contact_email, contact_phone, status, notes, verified)
VALUES
-- ── Larger established firms (recognised industry names — verify before contacting) ──
('JUBM Sdn Bhd',
 'Kuala Lumpur',
 NULL,
 'medium 20-50',
 ARRAY['quantity surveying','cost management','contract administration','PAM/JKR'],
 NULL, NULL, NULL,
 'prospect',
 'Established Malaysian QS firm. Confirm contact and current focus before outreach.',
 FALSE),

('KPK Quantity Surveyors',
 'Kuala Lumpur',
 NULL,
 'medium 20-50',
 ARRAY['quantity surveying','cost consultancy','contract advice'],
 NULL, NULL, NULL,
 'prospect',
 'Mid-sized Malaysian QS consultancy. Verify current office details before reaching out.',
 FALSE),

('IPM Professional Services',
 'Petaling Jaya',
 NULL,
 'small 5-20',
 ARRAY['quantity surveying','project management','PAM contracts'],
 NULL, NULL, NULL,
 'prospect',
 'Placeholder entry — replace with verified small-medium PJ firm.',
 FALSE),

('Juruperunding QS Konsulten',
 'Shah Alam',
 NULL,
 'small 5-20',
 ARRAY['quantity surveying','JKR contract advisory','BQ preparation'],
 NULL, NULL, NULL,
 'prospect',
 'Generic Bahasa Malaysia QS firm pattern — replace with confirmed company.',
 FALSE),

-- ── Smaller local consultancies (placeholders — REPLACE with real prospects) ──
('Klang Valley QS Partners A',
 'Subang Jaya',
 NULL,
 'micro <5',
 ARRAY['quantity surveying','BQ preparation','VO administration'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — replace with confirmed Subang Jaya QS consultancy. Target sub-5-headcount.',
 FALSE),

('Klang Valley QS Partners B',
 'Cheras',
 NULL,
 'micro <5',
 ARRAY['quantity surveying','small project costing'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — Cheras-based small QS firm. Find real candidate via LinkedIn / RISM directory.',
 FALSE),

('Klang Valley QS Partners C',
 'Petaling Jaya',
 NULL,
 'small 5-20',
 ARRAY['quantity surveying','tender preparation','cost planning'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — PJ-based small-medium firm. Likely candidate for first-batch beta.',
 FALSE),

('Klang Valley QS Partners D',
 'Kuala Lumpur',
 NULL,
 'micro <5',
 ARRAY['quantity surveying','contract administration'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — KL CBD small QS firm.',
 FALSE),

('Klang Valley QS Partners E',
 'Shah Alam',
 NULL,
 'small 5-20',
 ARRAY['quantity surveying','industrial projects','manufacturing'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — Shah Alam firm with industrial / manufacturing focus.',
 FALSE),

('Klang Valley QS Partners F',
 'Subang Jaya',
 NULL,
 'small 5-20',
 ARRAY['quantity surveying','high-rise residential','condo projects'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — Subang Jaya firm specialising in high-rise residential.',
 FALSE),

('Klang Valley QS Partners G',
 'Cheras',
 NULL,
 'medium 20-50',
 ARRAY['quantity surveying','contract claims','arbitration support'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — Cheras medium firm with claims focus. Ideal for the analyze_contract_clause pitch.',
 FALSE),

('Klang Valley QS Partners H',
 'Petaling Jaya',
 NULL,
 'small 5-20',
 ARRAY['quantity surveying','commercial buildings','retail'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — PJ small firm, commercial / retail specialty.',
 FALSE),

('Klang Valley QS Partners I',
 'Kuala Lumpur',
 NULL,
 'small 5-20',
 ARRAY['quantity surveying','government projects','JKR 203'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — KL firm with government / JKR project track record. Strong VO use case.',
 FALSE),

('Klang Valley QS Partners J',
 'Shah Alam',
 NULL,
 'micro <5',
 ARRAY['quantity surveying','SME contractors','renovation works'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — Shah Alam micro firm serving SME contractors.',
 FALSE),

('Klang Valley QS Partners K',
 'Cheras',
 NULL,
 'small 5-20',
 ARRAY['quantity surveying','infrastructure','road / drainage'],
 NULL, NULL, NULL,
 'prospect',
 'PLACEHOLDER — Cheras firm with infrastructure (roads, drainage) focus.',
 FALSE);

COMMIT;

SELECT 'qs_companies: ' || count(*) || ' rows' AS status FROM qs_companies;

