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
