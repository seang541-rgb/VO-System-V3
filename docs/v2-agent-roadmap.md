# V2 智能体升级路线图（待融资）

> 以下功能需要资金注入后才能实施。按优先级排序。

---

## 已完成 ✅

| # | 功能 | 说明 |
|---|------|------|
| 1 | 记忆自动提取 | 对话结束后 LLM 自动提取用户偏好/项目信息/领域知识，存入 copilot_memory |
| 6 | 动态上下文注入 | system prompt 自动附加当前工作区状态（文件、对比、BQ） |

---

## 待实施（需资金）

### 2. 流式响应（SSE Streaming）
- **现状**: agent-proxy 使用 `stream: false`，等全部生成完才返回
- **目标**: 实时逐字输出，提升用户体验
- **改动范围**:
  - `supabase/functions/agent-proxy/index.ts` — 改为 SSE streaming
  - `src/agent/agent-client.ts` — 解析 SSE 事件流
  - `src/components/CopilotPanel.tsx` — 逐字渲染
- **预估工时**: 2-3 天
- **资金需求**: 无额外 API 费用，但开发时间

### 3. 主动分析（Proactive Insights）
- **现状**: Copilot 完全被动，等用户问
- **目标**: IFC 上传后自动运行轻量分析，推送 insights
  - "检测到 652 面墙，3 面缺少 GlobalId"
  - "模型跨度 12 层，建议按楼层分批审核"
  - "发现 23 个 BuildingElementProxy，可能是未分类构件"
- **改动范围**:
  - `src/pages/ProjectWorkspace.tsx` — IFC 加载完成后触发分析
  - `src/agent/proactive-analyzer.ts` — 新建，轻量分析引擎（不需要 LLM）
  - `src/components/InsightsBanner.tsx` — 新建，显示主动分析结果
- **预估工时**: 3-4 天
- **资金需求**: 轻量分析不消耗 credit；若要 LLM 总结则需要额外 API 调用

### 4. 模型升级（LLM Backend）
- **现状**: NVIDIA NIM Llama 3.3 70B, MAX_TOKENS=2048
- **问题**: 工具调用不够稳定，上下文窗口小，偶尔循环调用
- **选项**:
  - A) **Gemini 2.5 Flash** — 1M 上下文，工具调用稳定，成本低
  - B) **Gemini 2.5 Pro** — 更强推理，成本中等
  - C) **Claude Sonnet** — 最强工具调用，成本较高
  - D) **混合**: Flash 做日常对话，Pro/Claude 做复杂分析
- **改动范围**:
  - `supabase/functions/agent-proxy/index.ts` — 切换 API endpoint 和格式
  - 可能需要调整 tool schema 格式（OpenAI → Gemini/Anthropic native）
- **预估工时**: 1-2 天（单模型）/ 4-5 天（混合路由）
- **资金需求**: API 月费，按用量计费
  - Gemini Flash: ~$0.15/1M input tokens
  - Gemini Pro: ~$1.25/1M input tokens
  - Claude Sonnet: ~$3/1M input tokens

### 5. 自主多步骤工作流（Agent Loop + Planning）
- **现状**: MAX_HOPS=4，单轮最多 4 次工具调用
- **目标**: 用户发出高级指令，agent 自主规划并执行多步骤
  - "帮我完整审核这个 IFC 并出报告" → 自动: audit → compare → commercial summary → export Excel
  - "检查这个 VO 是否符合 JKR 203 合约" → 自动: compare → analyze_contract_clause → 结构化评估
- **改动范围**:
  - `src/agent/agent-client.ts` — 增加 planning loop, 提高 MAX_HOPS
  - `src/agent/agent-planner.ts` — 新建，任务分解和执行计划
  - 需要更强的 LLM 支撑（见 #4）
- **预估工时**: 5-7 天
- **资金需求**: 更多 API 调用（每个工作流可能 5-10 次 LLM 调用）
- **前置依赖**: #4 模型升级

### 7. 后台任务队列 + 通知
- **现状**: 所有操作在前端阻塞执行
- **目标**: 大型任务（批量审核、多文件对比）后台执行，完成后通知
- **改动范围**:
  - Supabase Edge Function 做任务队列
  - `src/hooks/useTaskQueue.ts` — 任务状态轮询
  - 浏览器通知 API 或 toast 通知
- **预估工时**: 5-7 天
- **资金需求**: Supabase Edge Function 运行时间

---

## 远期规划（产品成熟后）

| 功能 | 说明 |
|------|------|
| 用户自定义 Agent | 自定义 prompt 模板、偏好输出格式、常用合约 |
| 多模态分析 | 上传 drawing PDF / 截图，agent 识别并分析 |
| 多人协作 | 同一项目多人共享 Copilot 对话和记忆 |
| Agent-to-Agent | 审核 agent、估价 agent、合约 agent 分工协作 |
| 离线模式 | 核心功能离线可用（IFC 解析本身已是客户端） |

---

## 资金分配建议

| 阶段 | 项目 | 预估成本 |
|------|------|---------|
| 第一期 | #2 流式响应 + #4 模型升级(Gemini Flash) | API 月费 ~RM50-200 |
| 第二期 | #3 主动分析 + #5 多步骤工作流 | 开发 2 周 + API 费用 |
| 第三期 | #7 后台队列 + 远期功能 | 视用户增长定 |
