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
