# VO Copilot 第 2 级：证据大脑设计规格

**日期：** 2026-05-27  
**基础提交：** `db1f6fc` (`codex/v2codex-brain-hardening`)  
**后续分支：** `codex/v2codex-evidence-brain`

## 目标

在第 1 级“稳定大脑”的服务端政策和估值边界之上，为 VO Copilot 建立统一、可显示、可留档的证据链。用户从 IFC、PDF/扫描件或 BQ 获取的结论，必须能够看到其出处；缺少支持证据时，系统继续拒绝正式结论或正式金额。

本轮同时覆盖三种项目资料：

- IFC：模型文件、槽位、构件、变化记录和数量来源。
- PDF/扫描件：文件、页码、文字摘录和 OCR/原生 PDF 识别状态。
- BQ：用户上传文件、item reference、描述、单位、已核验 rate 映射。

## 选择的方案

采用统一证据链方案，而不是让模型自由书写出处，也不在此阶段建设完整 RAG 平台。

统一证据链的原则：

1. 工具先生成结构化证据，模型只能引用这些证据。
2. 答案、运行记录、审批输出和报告使用同一组证据引用。
3. UI 显示可展开的依据卡片，而不显示模型中间推理或完整原始工具 JSON。
4. 法规、合同和正式知识库暂不重新开放；以后可按相同证据接口接入。

## 当前基础与缺口

当前稳定化版本已经具备：

- `agent-proxy` 固定模型、系统规则及工具 allowlist。
- `agent_runs`、`agent_steps`、`agent_evidence` 与审批表。
- IFC 查询/比较、PDF/OCR、BQ 映射、审批后报告及 Excel 导出。
- 没有核验 BQ 时不输出正式金额。

本轮必须补齐的缺口：

- `query_ifc` 与 `ocr_document` 结果尚未记录为可引用证据。
- OCR 文本虽然包含 `[Page N]` 标记，但结果数据没有稳定的逐页摘录结构供 UI 和引用使用。
- BQ 金额结论没有独立证据引用；Copilot 工具上下文也未携带 BQ 上传文件名。
- 最终回答没有绑定证据编号，页面只能展开工具 JSON，无法清楚回答“这句话依据什么”。
- PDF/Excel 正式输出没有统一证据索引。

## 证据模型

### 统一引用格式

每个 agent run 内生成稳定的引用编号，显示格式如下：

| 类型 | 显示编号示例 | 含义 |
| --- | --- | --- |
| IFC 查询/构件 | `[IFC-B-001]` / `[IFC-R-001]` | Base 或 Revision 文件中的构件/查询结果 |
| IFC 比较 | `[CMP-001]` | Base 与 Revision 的变化摘要或具体差异 |
| PDF/扫描件 | `[PDF-001:p3]` | 文件中的第 3 页摘录 |
| BQ 映射 | `[BQ-001]` | 用户 BQ 中已匹配的行项目和费率依据 |
| 审核输出 | `[AUD-001]` | IFC audit 提取或数量来源摘要 |

编号只在当前 run 内要求稳定；数据库中另外保存 UUID、run、step 和原始来源字段，避免依赖显示字符串作为主键。

### 结构化引用对象

前端和工具层使用一个共同的引用对象：

```ts
type EvidenceKind = 'ifc_component' | 'ifc_comparison' | 'document_page' | 'bq_item' | 'audit_result';

interface EvidenceReference {
  id: string;
  kind: EvidenceKind;
  label: string;
  sourceFileName: string | null;
  sourceSlot?: 'base' | 'revision';
  pageNumber?: number;
  excerpt?: string;
  locator?: {
    expressID?: number;
    ifcId?: string;
    itemReference?: string;
  };
  facts: Record<string, string | number | boolean | null>;
  confidence?: number | null;
  limitation?: string | null;
}
```

`facts` 只保存供引用的紧凑事实，例如构件类型、数量、单位、quantity source、rate 或 change count。大体积的原始解析结果继续保存在步骤结果内，不直接渲染给用户。

### 数据库存储

保留现有 `agent_evidence` 表与 RLS 模式；增加可区分当前证据来源的 `evidence_type` 值：

- `ifc_query`
- `document_extract`
- `bq_reference`

继续保留现有 `comparison`、`commercial_summary`、`audit` 和 `report`。每条证据的 `payload_json` 保存 `{ references: EvidenceReference[], summary, limitations }`。

数据库迁移只扩展约束，不清除历史 evidence，也不迁移旧记录内容。

## 数据流

### IFC 查询和比较

1. 用户加载 Base 或 Revision IFC。
2. `query_ifc` 返回匹配结果时，同时返回由实际文件名、槽位、构件 ID、数量字段和数量来源构成的 `evidenceRefs`。
3. `compare_ifc` 为摘要及被引用的差异项创建 `[CMP-*]` 引用；若涉及具体构件，可同时带对应 `[IFC-*]` 引用。
4. 答案中的数量或变化结论必须引用已返回的编号，例如：`Revision 新增 4 道墙 [CMP-001]`。

### PDF 与扫描件

1. `runOcr` 的 PDF 输出改为逐页结构，每页包含 `pageNumber`、`text`、`lines`、识别来源与置信状态。
2. `ocr_document` 将需要进入模型的页面摘录压缩为 `[PDF-*:pN]` 引用；页面处理被截断时，每条相关结论带 limitation。
3. 对单页图片使用页码 `p1`，并标明来源为 OCR。
4. PDF 中出现的指令文本仍属于不可信数据，不能影响系统政策或工具权限。

### BQ 与金额

1. `ToolContext` 增加 `bqFileName`，确保 BQ 引用能显示实际用户资料来源。
2. `summarize_commercial_impact` 仅为成功映射到用户 BQ、且单位匹配的 action 创建 `[BQ-*]` 引用。
3. 任何金额、rate 或 valuation conclusion 都必须绑定至少一条 `[BQ-*]` 引用；若不存在，继续显示“待上传/核验 BQ 及费率资料”。
4. IFC 变化事实与 BQ 价格依据分别引用，不把数量来源冒充费率来源。

### 回答和验证

1. 每次工具完成后，客户端为结果生成并记录 evidence refs，同时将紧凑引用内容作为不可信工具数据发回模型。
2. `agent-proxy` 的服务端规则增加要求：所有项目事实与金额结论必须在文本中使用已提供的引用编号；不得创造引用。
3. 客户端接收最终答案时解析引用编号，只允许显示当前 run 已登记的编号为有效引用。
4. 若答案涉及已运行工具却没有有效引用，UI 将答案标记为“缺少可核验引用”，并仍在下方显示实际收集到的依据卡片；该答案不能用于正式报告/导出依据。
5. 正式输出仍通过既有审批流程，并从结构化 evidence refs 生成证据索引，不依赖模型自由文本。

## UI 设计

Copilot 对话继续保持简洁，不恢复主动建议或推理展示。

每条最终助手回答可以带一个折叠的“依据”区域：

- 默认显示已引用证据数量和来源类型，例如 `依据 3 项：IFC 2 · PDF 1`。
- 展开后显示紧凑证据卡片：引用编号、文件名、页码或构件/item 定位、核心事实、限制提示。
- PDF 卡片显示短摘录，不显示整份文件全文。
- BQ 卡片显示 item reference、描述、单位和已核验 rate；金额未满足门槛时显示待核验状态。
- 无引用或引用无效的回答显示醒目的“未绑定可核验依据”，但不展示内部调试信息。

工具执行中的状态仍只显示通用进度；原始 tool JSON 不再作为主要用户界面信息。

## 报告与导出

- PDF 报告新增 Evidence Index 页或章节，列出被报告使用的 `[CMP-*]`、`[IFC-*]` 和 `[BQ-*]` 引用。
- Excel 导出增加 Evidence Index 工作表或等价索引区。
- 正式金额表格只接受具备 `[BQ-*]` 引用的金额行；否则继续显示 pending verification。
- 用户审批记录关联生成输出时采用的 evidence refs，便于之后复查输出依据。

## 服务端与安全边界

- `agent-proxy` 仍是模型、system policy 与工具定义的唯一控制者。
- 客户端不能上传自定义 system prompt、模型、工具定义或伪造的服务端证据政策。
- 工具结果、OCR 文本、文件名、引用摘录和 BQ 描述全部作为不可信数据传入模型。
- 未被 allowlist 开放的合同、法规、模板与估价工具继续关闭。
- `agent-ledger` 校验 evidence payload 大小、证据类型及 run 归属；用户只能读取自己的项目 evidence。

## 预计修改边界

以下模块是本轮预计触及的责任边界，具体行号在实施计划中确认：

- `src/agent/evidence.ts`：新建证据引用类型、编号分配、引用解析与摘要工具。
- `src/agent/tools.ts`：为 IFC、comparison、BQ commercial summary、OCR 和输出工具生成引用数据。
- `src/ocr/ocr-engine.ts`：提供逐页 PDF/OCR 结果。
- `src/agent/agent-client.ts`：收集 run 内引用、记录证据、验证最终答案引用。
- `src/components/CopilotPanel.tsx`：渲染答案依据摘要和可展开卡片。
- `src/report/pdf-generator.ts` 与 `src/vo-report.ts`：写入证据索引。
- `supabase/functions/agent-proxy/policy.ts`：强化引用规则。
- `supabase/functions/agent-ledger/index.ts` 与 Supabase migration：允许新的证据类型并保存结构化 payload。

## 测试与验收

### 自动化测试

- IFC 查询结果生成带正确文件、槽位和构件定位的 `[IFC-*]` 引用。
- IFC comparison 生成差异引用，并且没有资料时仍不生成虚假依据。
- PDF 文本和扫描件结果保留页码；第 N 页摘录对应 `[PDF-*:pN]`。
- BQ 未上传或未成功映射时，金额没有 `[BQ-*]` 引用且不得成为正式估值。
- BQ 成功映射且单位相符时，金额行带 `[BQ-*]` 引用。
- 最终答案引用未知编号时被标为无效；有合法编号时可显示其证据卡片。
- `agent-proxy` 政策要求引用且仍抵御文档注入指令。
- 报告/Excel 在证据充足时包含 evidence index，在费率证据不足时继续标明 pending verification。

### 浏览器验收

- 上传 PDF 后询问内容，回答显示具体页码依据，并可展开看到摘录。
- 加载 IFC 后询问构件或比较变化，回答显示模型文件和构件/差异依据。
- 上传并映射 BQ 后询问金额，回答显示 BQ item 依据。
- 未映射 BQ 时询问金额，页面不出现正式金额。
- 工具执行过程中无中间推理泄露，停止生成和审批后导出流程仍可用。

### 部署验收

- 部署 `agent-proxy` 与 `agent-ledger` 后，用认证用户验证证据写入和 RLS 可见范围。
- 用 owner 与非 owner 用户继续验证第 1 级计费规则没有回归。
- 使用真实 PDF、IFC 和 BQ 小样本完成端到端引用检查后，才考虑合并进正式主线。

## 非目标

本轮不包含：

- 马来西亚法规、合同条款或费率数据库重新开放。
- 全文向量检索、跨项目 RAG 或自动学习。
- 自动批准或绕过正式输出审批。
- 将旧的 agent evidence 历史数据批量转为新引用格式。

## 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 模型创造不存在的引用 | 客户端仅认可 run 内登记编号；报告只消费结构化引用 |
| OCR 误识别被当作结论 | PDF 引用保留识别类型、置信状态与 limitation |
| BQ 行映射错误造成金额误导 | 仅单位匹配且用户上传/映射的数据可作为 rate evidence |
| 数据库迁移影响已有记录 | 只扩展 evidence 类型约束，不删除或重写历史数据 |
| 第二级改动干扰稳定版本 | 独立分支开发，第一阶段 PR 与第二阶段验证分离 |

## 完成定义

第 2 级第一轮完成的定义是：Copilot 对 IFC、PDF/扫描件和 BQ 支持统一引用；重要回答可以从界面查看来源；正式报告/导出带证据索引；没有被引用和核验的数据仍不能形成正式金额或结论。
