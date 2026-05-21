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
