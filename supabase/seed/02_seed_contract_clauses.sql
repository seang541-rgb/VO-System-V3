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
