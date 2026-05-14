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
