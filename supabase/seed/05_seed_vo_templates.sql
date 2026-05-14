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
