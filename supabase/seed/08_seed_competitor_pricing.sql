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
