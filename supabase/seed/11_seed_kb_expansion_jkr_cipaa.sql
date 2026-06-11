-- Seed: KB expansion — JKR 203A core clauses + CIPAA 2012 + CIDB grades + key Acts
-- Sources verified 2026-06: JKR 203A Rev 1/2010 commentary (Thomas Philip, PAM PPF12,
-- RSIS comparative analysis), CIPAA Act 746 full text (adjudication.org, MahWengKwai),
-- CIDB registration guides (getfoundation.com.my, MISHU), JKR 20800-0226-20.
-- Idempotent via ON CONFLICT.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. contract_clauses — JKR 203A Rev 1/2010 expansion (EOT / LAD / CPC / DLP / termination)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO contract_clauses
  (contract_type, clause_number, title_en, title_cn, content_en, content_cn, category, keywords, verified)
VALUES
('JKR_203', '5',
 'S.O. Instructions — Contractor Duty to Comply',
 'S.O. 指令 — 承包商遵守义务',
 'The S.O. may from time to time issue instructions in regard to any matter under this Contract. The Contractor shall forthwith comply with all instructions issued by the S.O. If the Contractor fails to comply within seven (7) days after receipt of a written notice, the Government may employ others to execute the work and recover all costs from the Contractor.',
 'S.O. 可不时就本合同项下的任何事项发出指令。承包商应立即遵守 S.O. 发出的所有指令。如承包商在收到书面通知后七（7）天内未遵守，政府可雇用他人执行该工作，并向承包商追讨全部费用。',
 'variation',
 ARRAY['SO instruction','comply','7 days','指令','遵守'],
 TRUE),

('JKR_203', '39.5',
 'Certificate of Practical Completion (CPC)',
 '实际竣工证书（CPC）',
 'When the whole of the Works has been practically completed and the Contractor has performed all obligations under the Contract, the S.O. shall issue a Certificate of Practical Completion. Practical completion means the Works are complete and fit for their intended use, notwithstanding minor outstanding items that do not affect occupation or use. The Defects Liability Period commences from the date of practical completion stated in the CPC.',
 '当全部工程实际竣工且承包商已履行合同项下的所有义务时，S.O. 应签发实际竣工证书。实际竣工是指工程已完成并适合其预期用途，即使存在不影响占用或使用的轻微未完成项目。缺陷责任期自 CPC 所载的实际竣工日期起算。',
 'payment',
 ARRAY['CPC','practical completion','certificate','竣工证书','实际竣工'],
 TRUE),

('JKR_203', '40.1',
 'Liquidated and Ascertained Damages (LAD)',
 '预定违约赔偿金（LAD）',
 'If the Contractor fails to complete the Works by the Date for Completion or within any extended time granted under Clause 43, the Contractor shall pay the Government Liquidated and Ascertained Damages calculated at the rate stated in Appendix 1 for the period from the Date for Completion to the actual date of practical completion. LAD is a genuine pre-estimate of loss and the Government need not prove actual damage suffered.',
 '如承包商未能在竣工日期或第 43 条批准的任何延长期限内完成工程，承包商应按附录 1 所载费率向政府支付预定违约赔偿金，计算期间为竣工日期至实际竣工日期。LAD 是对损失的真实预估，政府无需证明实际遭受的损害。',
 'claim',
 ARRAY['LAD','liquidated damages','delay','late completion','违约金','延误','逾期竣工'],
 TRUE),

('JKR_203', '43.1',
 'Delay and Extension of Time (EOT) — Grounds',
 '延误与工期延长（EOT）— 理由',
 'Upon it becoming reasonably apparent that the progress of the Works is delayed, the Contractor shall give written notice to the S.O. The S.O. shall grant a fair and reasonable extension of time if the delay is caused by: (a) force majeure; (b) exceptionally inclement weather; (c) fire or other insurable risks; (d) instructions consequent upon disputes with neighbouring owners; (e) S.O. instructions including variations under Clause 31; (f) late issue of drawings, levels or instructions; (g) delay in giving possession of site; (h) civil commotion, strike or lockout; (i) delay by nominated sub-contractors or suppliers; (j) shortage of labour or materials certified by the Government. Note: under JKR 203A the contractor notice requirement is directory, not mandatory — but timely notice remains best practice.',
 '当工程进度明显延误时，承包商应向 S.O. 发出书面通知。如延误由以下原因造成，S.O. 应批准公平合理的工期延长：(a) 不可抗力；(b) 异常恶劣天气；(c) 火灾或其他可保风险；(d) 与邻地业主纠纷引起的指令；(e) S.O. 指令（包括第 31 条的变更）；(f) 图纸、标高或指令延迟发出；(g) 延迟移交工地；(h) 内乱、罢工或停工；(i) 指定分包商或供应商的延误；(j) 政府证明的劳工或材料短缺。注：JKR 203A 下承包商的通知要求为指导性而非强制性 — 但及时通知仍是最佳实践。',
 'eot',
 ARRAY['EOT','extension of time','delay','force majeure','notice','工期延长','延误','不可抗力'],
 TRUE),

('JKR_203', '48.1',
 'Defects After Completion — Defects Liability Period (DLP)',
 '竣工后缺陷 — 缺陷责任期（DLP）',
 'Any defect, shrinkage or other fault which appears during the Defects Liability Period (normally 12 months from practical completion, as stated in Appendix 1) due to materials or workmanship not in accordance with the Contract shall be made good by the Contractor at his own cost. The S.O. shall deliver a Schedule of Defects to the Contractor not later than fourteen (14) days after the expiration of the DLP. Upon making good all defects, the S.O. issues the Certificate of Completion of Making Good Defects (CMGD), whereupon the Performance Bond may be released.',
 '在缺陷责任期内（通常为实际竣工后 12 个月，见附录 1）因材料或工艺不符合合同而出现的任何缺陷、收缩或其他瑕疵，承包商应自费修复。S.O. 应在 DLP 届满后十四（14）天内向承包商送达缺陷清单。所有缺陷修复完成后，S.O. 签发缺陷修复完成证书（CMGD），履约保证金随之可予释放。',
 'claim',
 ARRAY['DLP','defects liability','schedule of defects','CMGD','14 days','缺陷责任期','缺陷清单','保证金'],
 TRUE),

('JKR_203', '51.1',
 'Termination — Events of Default by the Contractor',
 '终止 — 承包商违约事件',
 'The Government may terminate the Contract if the Contractor: (a) wholly suspends the Works without reasonable cause; (b) fails to proceed regularly and diligently; (c) refuses or persistently neglects to comply with a written notice from the S.O. to remove defective work; (d) fails to comply with Clause 31 (variations) obligations; or (e) becomes insolvent. Upon termination under Clause 51, the Performance Bond or any balance thereof shall be forfeited, and the Government may employ others to complete the Works and recover additional costs from the Contractor.',
 '如承包商：(a) 无合理理由完全暂停工程；(b) 未能正常且勤勉地推进工程；(c) 拒绝或持续忽视遵守 S.O. 要求移除缺陷工程的书面通知；(d) 未履行第 31 条（变更）义务；或 (e) 资不抵债，政府可终止合同。根据第 51 条终止时，履约保证金或其任何余额将被没收，政府可雇用他人完成工程并向承包商追讨额外费用。',
 'termination',
 ARRAY['termination','default','forfeit','performance bond','终止','违约','没收保证金'],
 TRUE),

-- ════════════════════════════════════════════════════════════════════════════
-- CIPAA 2012 (Act 746) — statutory payment & adjudication regime.
-- Stored as contract_type 'CIPAA_2012' so analyze_contract_clause can fetch by section.
-- ════════════════════════════════════════════════════════════════════════════

('CIPAA_2012', '5',
 'Payment Claim by Unpaid Party',
 '未获付款方的付款索赔',
 'An unpaid party may serve a written payment claim on a non-paying party for payment pursuant to a construction contract. The payment claim shall state: the amount claimed and due date for payment; details identifying the cause of action including the contract provision to which the payment relates; and a description of the work or services. Applies to all written construction contracts for works carried out wholly or partly in Malaysia, including Government contracts (exception: buildings below 4 storeys wholly for a natural person''s own occupation).',
 '未获付款方可就建筑合同项下的付款向欠款方送达书面付款索赔。付款索赔应载明：索赔金额及付款到期日；识别诉因的细节（包括付款所涉的合同条款）；以及工程或服务的描述。适用于在马来西亚全部或部分施工的所有书面建筑合同，包括政府合同（例外：四层以下、完全供自然人自住的建筑）。',
 'payment',
 ARRAY['CIPAA','payment claim','unpaid party','付款索赔','追款'],
 TRUE),

('CIPAA_2012', '6',
 'Payment Response — 10 Working Days',
 '付款答复 — 10 个工作日',
 'The non-paying party shall serve a written payment response on the unpaid party within ten (10) working days of receipt of the payment claim, either admitting the claim or disputing it (in whole or in part) with reasons. Failure to respond within 10 working days means the entire payment claim is deemed disputed, entitling the unpaid party to proceed to adjudication.',
 '欠款方应在收到付款索赔后十（10）个工作日内向未获付款方送达书面付款答复，承认索赔或（全部或部分）提出异议并说明理由。未在 10 个工作日内答复，则整个付款索赔被视为有争议，未获付款方有权启动审裁程序。',
 'payment',
 ARRAY['CIPAA','payment response','10 working days','deemed disputed','付款答复','10个工作日'],
 TRUE),

('CIPAA_2012', '9-11',
 'Adjudication Pleadings Timeline',
 '审裁文件时间表',
 'After the adjudicator accepts appointment: the claimant serves the adjudication claim within ten (10) working days of the acceptance (s.9); the respondent serves the adjudication response within ten (10) working days of receiving the claim (s.10); the claimant may serve a reply within five (5) working days of receiving the response (s.11).',
 '审裁员接受委任后：申索方应在接受委任后十（10）个工作日内送达审裁申索书（第 9 条）；答辩方应在收到申索书后十（10）个工作日内送达审裁答辩书（第 10 条）；申索方可在收到答辩书后五（5）个工作日内送达回复（第 11 条）。',
 'claim',
 ARRAY['CIPAA','adjudication claim','response','reply','timeline','审裁','时间表'],
 TRUE),

('CIPAA_2012', '12',
 'Adjudication Decision — 45 Working Days',
 '审裁决定 — 45 个工作日',
 'The adjudicator shall decide the dispute within forty-five (45) working days from service of the adjudication response or reply (whichever is later), or from the expiry of the period for the response if none is received. A decision not made within this period is void. The decision must be in writing with reasons, stating the adjudicated amount, time and manner of payment.',
 '审裁员应在审裁答辩书或回复送达后（以较晚者为准）四十五（45）个工作日内，或在未收到答辩书时自答辩期届满后 45 个工作日内对争议作出决定。未在此期限内作出的决定无效。决定须以书面形式作出并附理由，载明审裁金额、付款时间和方式。',
 'claim',
 ARRAY['CIPAA','adjudication decision','45 working days','void','审裁决定','45个工作日'],
 TRUE),

('CIPAA_2012', '28',
 'Enforcement of Adjudication Decision',
 '审裁决定的执行',
 'A party may apply to the High Court to enforce an adjudication decision as if it were a judgment or order of the High Court. The adjudication decision is binding unless set aside, the dispute is finally decided by arbitration or court, or settled in writing by the parties (s.13).',
 '一方可向高等法院申请执行审裁决定，犹如该决定是高等法院的判决或命令。除非被撤销、争议经仲裁或法院最终裁决、或双方书面和解（第 13 条），审裁决定具有约束力。',
 'payment',
 ARRAY['CIPAA','enforcement','high court','binding','执行','高等法院'],
 TRUE),

('CIPAA_2012', '29',
 'Right to Suspend or Slow Down Work',
 '暂停或放慢工程的权利',
 'If the adjudicated amount is not paid, the winning party may — after giving written notice and waiting fourteen (14) calendar days from receipt of the notice — suspend performance or reduce the rate of progress of work without breaching the contract, is entitled to a fair EOT, and may recover loss and expenses incurred.',
 '如审裁金额未获支付，胜方可在发出书面通知并自通知送达起等待十四（14）个日历日后，暂停履约或放慢工程进度而不构成违约，并有权获得公平的工期延长及追讨所产生的损失和费用。',
 'claim',
 ARRAY['CIPAA','suspend work','14 days','slow down','暂停工程','放慢进度'],
 TRUE),

('CIPAA_2012', '30',
 'Direct Payment from Principal',
 '业主直接付款',
 'If a party fails to pay the adjudicated amount, the winning party may make a written request for direct payment from the principal of the non-paying party (e.g. the employer above a defaulting main contractor). The principal shall pay from money due to the non-paying party and may recover the amount as a debt.',
 '如一方未支付审裁金额，胜方可书面要求欠款方的上层业主直接付款（例如向违约总承包商上面的雇主请求）。业主应从应付给欠款方的款项中支付，并可将该金额作为债务追讨。',
 'payment',
 ARRAY['CIPAA','direct payment','principal','subcontractor','直接付款','业主'],
 TRUE),

('CIPAA_2012', '35',
 'Conditional Payment (Pay-When-Paid) Void',
 '有条件付款（背靠背条款）无效',
 'Any conditional payment provision in a construction contract is void — including "pay-when-paid" / "pay-if-paid" clauses that make payment conditional on receipt of payment from a third party, or on the availability of funds. This protects subcontractors from back-to-back payment risk.',
 '建筑合同中的任何有条件付款条款均属无效 — 包括使付款以收到第三方付款或资金到位为条件的"背靠背付款"条款。此条保护分包商免受背靠背付款风险。',
 'payment',
 ARRAY['CIPAA','pay when paid','conditional payment','void','back to back','背靠背','无效'],
 TRUE),

('CIPAA_2012', '36',
 'Default Payment Terms (Absent Contract Terms)',
 '默认付款条款（合同未约定时）',
 'Where a construction contract does not contain payment terms: progress payments are due on a monthly basis, calculated on the value of work done, and payment is due thirty (30) calendar days from receipt of the invoice.',
 '当建筑合同未载明付款条款时：进度款按月支付，按已完成工程的价值计算，付款应在收到发票后三十（30）个日历日内到期。',
 'payment',
 ARRAY['CIPAA','default terms','monthly','30 days','invoice','默认条款','月付','30天'],
 TRUE)

ON CONFLICT (contract_type, clause_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. bim_regulations — key Acts + CIDB contractor grades + JKR specifications
-- ════════════════════════════════════════════════════════════════════════════
-- bim_regulations has no natural unique key (only serial id), so the base schema's
-- ON CONFLICT DO NOTHING cannot dedup on re-run. Add a partial unique index on
-- document_number so this seed is safely idempotent. Existing rows all have
-- distinct document_numbers, so the index builds without error.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bim_reg_docnum_unique
  ON bim_regulations (document_number) WHERE document_number IS NOT NULL;

INSERT INTO bim_regulations
  (regulation_type, title, title_cn, issuing_body, document_number, effective_date, value_threshold, currency, scope, scope_cn, verified)
VALUES
('act', 'Construction Industry Payment and Adjudication Act 2012 (CIPAA, Act 746)',
 '建筑业付款与审裁法令 2012（CIPAA，Act 746）',
 'Parliament of Malaysia', 'ACT_746', '2014-04-15', NULL, NULL,
 'Statutory adjudication regime for construction payment disputes. Payment claim/response (s.5-6), adjudication decided within 45 working days (s.12), enforcement via High Court (s.28), right to suspend work (s.29), direct payment from principal (s.30), pay-when-paid clauses void (s.35). Applies to all written construction contracts in Malaysia including Government contracts.',
 '建筑付款争议的法定审裁制度。付款索赔/答复（第5-6条）、45个工作日内作出审裁决定（第12条）、经高等法院执行（第28条）、暂停工程权（第29条）、业主直接付款（第30条）、背靠背付款条款无效（第35条）。适用于马来西亚所有书面建筑合同，包括政府合同。',
 TRUE),

('act', 'Street, Drainage and Building Act 1974 (Act 133)',
 '街道、排水与建筑法令 1974（Act 133）',
 'Parliament of Malaysia', 'ACT_133', '1974-06-01', NULL, NULL,
 'Parent legislation for building control in Peninsular Malaysia — empowers local authorities to approve building plans, issue notices, and enforce against unauthorised works. The UBBL 1984 is made under this Act. Section 70 governs submission and approval of building plans; s.70A covers earthworks.',
 '马来西亚半岛建筑管制的母法 — 授权地方政府批准建筑图纸、发出通知并对未经批准的工程执法。UBBL 1984 即根据本法令制定。第 70 条规管建筑图纸的提交与批准；第 70A 条涵盖土方工程。',
 TRUE),

('act', 'Occupational Safety and Health Act 1994 (Act 514, amended 2022)',
 '职业安全与健康法令 1994（Act 514，2022年修订）',
 'Parliament of Malaysia / DOSH', 'ACT_514', '1994-02-25', NULL, NULL,
 'General duties on employers and principals for workplace safety, applicable to construction sites. The 2022 amendment (in force 1 June 2024) extends duties to all workplaces, raises penalties, and requires risk assessment. Construction-specific requirements administered by DOSH (e.g. notification of construction work, safety officers on larger sites).',
 '雇主和业主对工作场所安全的一般义务，适用于建筑工地。2022 年修订（2024年6月1日生效）将义务扩展至所有工作场所、提高罚则并要求风险评估。建筑业具体要求由 DOSH 管理（如施工通报、大型工地须配备安全主任）。',
 TRUE),

('act', 'Fire Services Act 1988 (Act 341) — Bomba Plan Approval',
 '消防服务法令 1988（Act 341）— 消防局图审',
 'Parliament of Malaysia / BOMBA', 'ACT_341', '1988-09-01', NULL, NULL,
 'Empowers the Fire and Rescue Department (Bomba) to review and approve fire safety aspects of building plans (active fire protection systems), issue Fire Certificates for designated premises, and enforce fire safety requirements alongside UBBL Parts VII-VIII.',
 '授权消防与拯救局（Bomba）审查和批准建筑图纸的消防安全部分（主动消防系统）、为指定场所签发消防证书，并与 UBBL 第 VII-VIII 部分共同执行消防安全要求。',
 TRUE),

('policy', 'JKR Standard Specifications for Building Works 2020 (JKR 20800)',
 'JKR 建筑工程标准规范 2020（JKR 20800）',
 'JKR Malaysia', 'JKR 20800-0226-20', '2020-01-02', NULL, NULL,
 'The default workmanship and materials specification for Malaysian government building projects. Key sections: A Preliminaries; B Excavation & Earthworks; C Foundation/Piling; D Concreting (D/1-D/68); E Brickwork; F Roofing; J Structural Steel & Metalworks; plus architectural, plumbing, sanitary and external works trades. Referenced in JKR 203/203A contract documents and BQ preambles.',
 '马来西亚政府建筑项目默认的工艺与材料规范。主要章节：A 前期工程；B 开挖与土方；C 基础/打桩；D 混凝土（D/1-D/68）；E 砖砌；F 屋面；J 结构钢与金属工程；以及建筑装修、给排水、卫生设备和外部工程等。JKR 203/203A 合同文件和 BQ 前言中引用。',
 TRUE),

('mandate', 'CIDB Levy — 0.125% of Contract Sum (Act 520 s.34)',
 'CIDB 征费 — 合同金额的 0.125%（Act 520 第34条）',
 'CIDB Malaysia', 'ACT_520_S34', '1994-07-01', 500000, 'MYR',
 'Every contractor undertaking a construction contract exceeding RM 500,000 must pay a levy of 0.125% of the contract sum to CIDB before commencing work. Failure to pay is an offence and bars the contractor from undertaking the works.',
 '承接超过 RM 500,000 建筑合同的每个承包商，必须在开工前向 CIDB 缴纳合同金额 0.125% 的征费。未缴付属违法行为，承包商不得开展该工程。',
 TRUE),

-- CIDB contractor registration grades (Registration of Contractors Regulations under Act 520)
('mandate', 'CIDB Contractor Grade G1 — Tender Capacity ≤ RM 200,000',
 'CIDB 承包商等级 G1 — 投标上限 ≤ RM 200,000',
 'CIDB Malaysia', 'CIDB-GRADE-G1', NULL, 200000, 'MYR',
 'Smallest registration grade. Minimum capital RM 5,000. Tendering capacity not exceeding RM 200,000 per project.',
 '最小注册等级。最低资本 RM 5,000。每个项目投标能力不超过 RM 200,000。', TRUE),

('mandate', 'CIDB Contractor Grade G2 — Tender Capacity ≤ RM 500,000',
 'CIDB 承包商等级 G2 — 投标上限 ≤ RM 500,000',
 'CIDB Malaysia', 'CIDB-GRADE-G2', NULL, 500000, 'MYR',
 'Minimum capital RM 25,000. Tendering capacity not exceeding RM 500,000.',
 '最低资本 RM 25,000。投标能力不超过 RM 500,000。', TRUE),

('mandate', 'CIDB Contractor Grade G3 — Tender Capacity ≤ RM 1,000,000',
 'CIDB 承包商等级 G3 — 投标上限 ≤ RM 1,000,000',
 'CIDB Malaysia', 'CIDB-GRADE-G3', NULL, 1000000, 'MYR',
 'Minimum capital RM 50,000. Tendering capacity not exceeding RM 1 million.',
 '最低资本 RM 50,000。投标能力不超过 RM 100 万。', TRUE),

('mandate', 'CIDB Contractor Grade G4 — Tender Capacity ≤ RM 3,000,000',
 'CIDB 承包商等级 G4 — 投标上限 ≤ RM 3,000,000',
 'CIDB Malaysia', 'CIDB-GRADE-G4', NULL, 3000000, 'MYR',
 'Minimum capital RM 150,000. Tendering capacity not exceeding RM 3 million. Requires one qualified technical personnel.',
 '最低资本 RM 150,000。投标能力不超过 RM 300 万。需要一名合格技术人员。', TRUE),

('mandate', 'CIDB Contractor Grade G5 — Tender Capacity ≤ RM 5,000,000',
 'CIDB 承包商等级 G5 — 投标上限 ≤ RM 5,000,000',
 'CIDB Malaysia', 'CIDB-GRADE-G5', NULL, 5000000, 'MYR',
 'Minimum capital RM 250,000. Tendering capacity not exceeding RM 5 million.',
 '最低资本 RM 250,000。投标能力不超过 RM 500 万。', TRUE),

('mandate', 'CIDB Contractor Grade G6 — Tender Capacity ≤ RM 10,000,000',
 'CIDB 承包商等级 G6 — 投标上限 ≤ RM 10,000,000',
 'CIDB Malaysia', 'CIDB-GRADE-G6', NULL, 10000000, 'MYR',
 'Minimum capital RM 500,000. Tendering capacity not exceeding RM 10 million.',
 '最低资本 RM 500,000。投标能力不超过 RM 1000 万。', TRUE),

('mandate', 'CIDB Contractor Grade G7 — No Tender Limit',
 'CIDB 承包商等级 G7 — 无投标上限',
 'CIDB Malaysia', 'CIDB-GRADE-G7', NULL, NULL, 'MYR',
 'Highest grade — no limit on tendering capacity. Minimum capital RM 750,000, plus qualified technical personnel (one Group A + one Group B with 5 years experience, or two Group A with one having 5 years experience).',
 '最高等级 — 投标能力无上限。最低资本 RM 750,000，另需合格技术人员（一名 A 组 + 一名具 5 年经验的 B 组人员，或两名 A 组人员其中一名具 5 年经验）。', TRUE)

ON CONFLICT (document_number) WHERE document_number IS NOT NULL DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. ms_standards — accessibility standards referenced by UBBL By-law 87/88
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO ms_standards
  (standard_number, title, title_cn, category, scope, year, verified)
VALUES
('MS 1184', 'Universal Design and Accessibility in the Built Environment — Code of Practice',
 '建筑环境通用设计与无障碍规范', 'access',
 'Requirements for accessible routes, ramps (1:12 max gradient), doors, lifts, toilets and signage for persons with disabilities. Referenced by UBBL By-law 87.', 2014, TRUE),

('MS 1331', 'Code of Practice for Access of Disabled Persons Outside Buildings',
 '建筑物外残障人士通道规范', 'access',
 'External accessibility — footpaths, kerb ramps, pedestrian crossings and external circulation for disabled persons. Referenced alongside MS 1184 in UBBL By-law 87.', 2003, FALSE)

ON CONFLICT (standard_number) DO NOTHING;

COMMIT;

SELECT 'contract_clauses: ' || count(*) AS status FROM contract_clauses
UNION ALL
SELECT 'bim_regulations: ' || count(*) FROM bim_regulations
UNION ALL
SELECT 'ms_standards: ' || count(*) FROM ms_standards;
