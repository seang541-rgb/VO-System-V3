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
