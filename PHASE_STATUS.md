# Idea Nest — Phase Status (Scorecard)

> 单页快照：现在做完了什么、还差什么、下一步动什么。
> 详细时间线见 `PROGRESS_LOG.md`。
>
> **最后更新：** 2026-05-13 · 用户在 Sri Lanka，回马来西亚 deadline ≈ 2026-07-18（剩 ~9 周）

---

## 🎯 一句话现状

**9 工具 Copilot 已上线 + 8 张知识库表 + 几何提取真实数字 + 城堡级压测通过（48MB / 2,672 元素 / 42.7s）。** 剩下做的：BQ 定价导入 + 真实回归 + 流式响应 + 商业化包装 + 部署上线。

## 🏰 真实压力测试通过（2026-05-13）

48MB ArchiCAD 城堡模型 / 78 万 IFC 实体 / 2,672 audit 元素：

- ✅ **42.7 秒**端到端审计（16ms/元素，线性扩展）
- ✅ **96% 几何提取成功**（2,569 mesh / 103 empty-mesh）
- ✅ **浏览器内存 +33MB**（共 196MB，离 4GB 上限远）
- ✅ **1,443 m³ 净体积、14,975 m² 墙侧面积** 真实输出
- ✅ Llama 3.3 完整摘要 5 个 JKR 代码分类
- **核心架构假设全部成立**：浏览器单机跑 + LLM 与算量解耦 + 线性扩展无内存泄漏

---

## ✅ 已完成的 Phase

### Phase 1 — Copilot 端到端打通（2026-04 月初 + 5/8 验证）
- ✅ 5 个工具（query_ifc, compare_ifc, summarize_commercial_impact, export_vo_excel, audit_ifc stub）
- ✅ Supabase Auth → Edge Function → LLM 链路
- ✅ Credit 扣费（consume_credit RPC）
- ✅ 多 hop tool calling 循环

### LLM 后端切换（2026-05-09）
- ✅ Anthropic → Gemini → **NVIDIA NIM (Llama 3.3 70B)**
- ✅ OpenAI 兼容协议
- ✅ NVIDIA NIM 免费 1 年

### Idea Nest 品牌 + UI 重构（2026-05-09）
- ✅ VO System → **Idea Nest** + 中英 tagline
- ✅ **Copilot-first** sidebar layout（取代旧版三个对等 tab）
- ✅ 兼容老用户的"原 VO System 升级"banner

### Phase 2.5 — 合约条款分析（2026-05-09）
- ✅ `analyze_contract_clause` 工具，支持用户粘条款 OR KB 查询
- ✅ 结构化 4 字段评估（eligible / clauseExcerpt / reasoning / recommendedAction）

### Phase 2 — IdeaNest 审计引擎 TS 移植（2026-05-12）
- ✅ 5 天 5 个模块，1681 LOC TypeScript
- ✅ 101/101 单元测试通过
- ✅ `audit_ifc` 工具上线
- ✅ 5/12 后期：**几何提取激活**（之前所有数量返回 0 的问题彻底解决）

### Phase 3 🅰 数据准确性 — 前半段（2026-05-12）
- ✅ 8 张知识库表 + 126 行真实数据（contract_clauses / ubbl_provisions / ms_standards / vo_templates / measurement_codes / bim_regulations / competitor_pricing / qs_companies）
- ✅ Copilot 工具集 5 → **9** 工具（新增 lookup_regulation / lookup_measurement_code / get_vo_template + 增强 analyze_contract_clause）
- ✅ 所有 9 工具浏览器实测通过
- ✅ BimEngine 历史 StreamMeshes bug 修复

---

## ⏳ 进行中的 Phase

### Phase 3 🅰 数据准确性 — 后半段（2-3 周）
- ⬜ **真实 BQ 定价库导入** — 替换"Built-in Test BQ Library"，导入 JKR / SMM2 标准单价
- ⬜ **真实 IFC 回归校准** — 用真 JKR 项目 IFC 跑全链路，跟手工 QS 算量对比

---

## ⬜ 未开始的 Phase

### Phase 3 🅱 生产化工程（2.5 周）
- ⬜ LLM 流式响应（避免长查询时 "Thinking..." 等 30s）
- ⬜ 对话历史持久化到 Supabase
- ⬜ 上下文窗口管理（长对话自动 summarize）
- ⬜ 错误监控（Sentry / Supabase logs）

### Phase 3 🅲 商业化包装（4.5 周）
- ⬜ 分层定价（Free / Pro RM 499 / Team RM 1999）
- ⬜ Marketing landing page（`ideanest.com`）
- ⬜ 用户文档（如何上传 IFC / 用 Copilot / 解读 Excel）
- ⬜ Beta 用户开放（邀请 3-5 个 QS 朋友 + 周度反馈）

### Phase 3 🅳 部署上线（2 天）
- ⬜ GitHub public 仓库 + README
- ⬜ Vercel 部署 + 环境变量
- ⬜ 自定义域名 + SSL
- ⬜ 生产 Stripe webhook（live mode）

---

## 🏰 城堡压测暴露的优化点（按优先级，周六攻克）

压测通过 = 架构对，但运行中体感和细节都还差。按"改完最让用户爽"排：

### 🔴 P0 — 体感杀手（用户最先抱怨）

| # | 问题 | 优化方案 | 工作量 |
|---|---|---|---|
| 1 | 42 秒主线程阻塞，UI 完全卡死 | **`runAudit` 移到 Web Worker** 后台线程跑 | 4-8 小时 |
| 2 | 用户看不到进度，以为挂了 | **`onProgress(current, total)` 回调** + UI 显示 "已审计 1500/2672" | 2-4 小时 |
| 3 | Llama 生成回复时整段 30+ 秒不动 | **LLM 流式响应（SSE）** — 字一个个出 | 4-6 小时 |

→ **这 3 件做完，城堡审计从"卡死 70 秒"变成"流畅可看的 70 秒"**

### 🟠 P1 — 体验提升

| # | 问题 | 方案 | 工作量 |
|---|---|---|---|
| 4 | 同模型重审 42 秒 | **localStorage 缓存** audit 结果（key = IFC SHA-256） | 1-2 小时 |
| 5 | 审计中无法取消 | **AbortSignal** 贯穿 runAudit | 1-2 小时 |
| 6 | 934 个 wall-unclassified（缺 IsExternal/LoadBearing pset） | 工具结果加 **"IFC 缺关键 pset，建议补全 / 接受 wall-unclassified 为多数"** 提示 | 1 小时 |
| 7 | 103 元素 empty-mesh（4%）—— 不知道为什么 | 加诊断日志 + 在 sampleRecords 里标 emptyMeshReason | 1 小时 |
| 8 | Llama 输出有时截断（COLUMN 行没显示） | 工具返回压缩 sampleRecords / 增加 topBqRows 优先级 | 2-3 小时 |

### 🟡 P2 — 长期质量

| # | 问题 | 方案 | 工作量 |
|---|---|---|---|
| 9 | 没有审计置信度指标 | 每个 record 加 `confidence: 'high' \| 'medium' \| 'low'`（基于 quantitySource + 几何 source） | 2-3 小时 |
| 10 | 没有内存预警 | heap > 2GB 时浏览器 console.warn | 1 小时 |
| 11 | 多次审计后 web-ifc WASM 内存不释放？ | 加 `flatMesh.delete()` 等更严格的资源清理 + 测量 | 1-2 小时 |
| 12 | 没有埋点 | 加 audit 耗时 / 成功率 / 元素数分布的简单 metrics | 2-3 小时 |

### 💡 周六建议的实战顺序

```
上午（3 小时）：    P0 #2 Progress UI + P0 #3 LLM 流式响应 — 用户最痛
下午（3-4 小时）：  P0 #1 Web Worker — 技术债，但最有里程碑感
晚上（1-2 小时）：  P1 #4 缓存 + P1 #6 智能提示 — 收尾
```

做完这一波，可以拿城堡录 demo 视频了——70 秒变成"看着 Agent 一步步工作，最后给出结果"的流畅体验。

---

## 🟡 测试遗留（生产前必须清）

| 项 | 位置 | 操作 |
|---|---|---|
| `BYPASS_CREDITS=true` Supabase secret | Supabase Dashboard | `npx supabase secrets unset BYPASS_CREDITS` |
| Edge Function bypass 分支 | `supabase/functions/agent-proxy/index.ts:67-75` | 移除（标了 "REMOVE before production"） |
| `window.__engine` 暴露 | `src/App.tsx:346` | 移除（标了 "DEV ONLY"） |
| `window.__ifcHandle` 暴露 | `src/App.tsx:1019` | 同上 |

---

## ⚙️ 已确认的技术决策

| 决策 | 状态 |
|---|---|
| LLM 后端 | NVIDIA NIM (Llama 3.3 70B 当前；下次切 `z-ai/glm-5.1` 试) |
| LLM 协议 | OpenAI 兼容（chat/completions） |
| 工具执行位置 | 客户端（浏览器）✅ 经 48MB / 2672 元素压测 |
| 几何提取 API | `api.GetFlatMesh`（不是 `StreamMeshes`）✅ 96% 成功率 |
| 审计引擎 | 浏览器 TS 端口（不做 Python 微服务）✅ 线性扩展验证 |
| Credit 模型 | 1 credit/对话 + 1 credit/Excel 导出（同池） |
| 品牌 | Idea Nest（subline: VO Copilot · 变更单与合约索赔智能体） |

---

## 📁 关键文件位置

| 用途 | 路径 |
|---|---|
| **本文档（状态快照）** | `D:/VO system/PHASE_STATUS.md` |
| **开发日志（详细时间线）** | `D:/VO system/PROGRESS_LOG.md` |
| 架构 + 部署 | `D:/VO system/AGENT_SETUP.md` |
| Phase 2 计划（归档参考） | `D:/VO system/AGENT_PHASE2_PLAN.md` |
| Phase 1 验证清单（已完成） | `D:/VO system/AGENT_PHASE1_CHECKLIST.md` |
| 历史 v1 设计文档 | `D:/VO system/_archived_v1_handover.md` |
| Memory 索引 | `C:/Users/johns/.claude/projects/D--/memory/MEMORY.md` |

---

## 🚀 下次工作的开工顺序（建议）

1. **重启 Claude Code session** → Superpowers 14 个 skill 可用
2. **切 LLM 到 `z-ai/glm-5.1`**（5 分钟） → A/B 测试 vs Llama 3.3
3. **真实 BQ 定价数据导入**（Phase 3 🅰 后半段，1 周）
4. **几个真 JKR 项目 IFC 回归测试**（Phase 3 🅰 收尾，1 周）
5. 进入 Phase 3 🅱 生产化 — **流式响应 + Web Worker** 优先（城堡压测发现的 42s 阻塞痛点）
6. Phase 3 🅲 商业化 + 🅳 部署

## 🧪 测试 IFC 集（按规模）

| 文件 | 规模 | 用途 |
|---|---|---|
| `basin-tessellation.ifc` + `V2_basin.ifc` | 12KB 各 / 1 组件 | 最小 VO 对比测试集 |
| `D:\IFC\01_wall_simple.ifc` ~ `06_slab.ifc` | 8K-300K / 单类型元素 | 单构件验证 |
| `D:\IFC\07_building_arch.ifc` | 221KB / 7 元素（4 墙 + 3 板）| audit_ifc 基准测试 |
| `D:\IFC\08_building_str.ifc` | 290KB / 含结构 | 结构构件测试 |
| `D:\IFC\10_infra_bridge.ifc` | 1.9MB / 基础设施 | 中等规模 |
| **`Ifc2x3_SampleCastle.ifc`** | **48MB / 78 万实体 / 2,672 audit 元素** | **✅ 压测已过（42.7s, 16ms/元素）** |
| **`IFC Schependomlaan incl planningsdata.ifc`** | **63MB / 84 万实体 / 2,570 audit 元素** | **✅ Audit 通过（3.8s, 1.9ms/元素）+ ✅ VO compare 100% 准确（2A+2D+6M 全部抓到）** |

---

## 📊 总进度

```
Phase 1                    ████████████████████ 100%
Phase 2.5                  ████████████████████ 100%
Phase 2                    ████████████████████ 100%  + 城堡级压测通过 🏰
Phase 3 🅰 数据准确性      ████████████░░░░░░░░  60%  (KB + 几何完成；BQ 定价 + 回归校准未做)
Phase 3 🅱 生产化           ░░░░░░░░░░░░░░░░░░░░   0%
Phase 3 🅲 商业化           ░░░░░░░░░░░░░░░░░░░░   0%
Phase 3 🅳 部署             ░░░░░░░░░░░░░░░░░░░░   0%

Overall: 4.6/7 phases done (~66%) · 时间余量 ~9 周
架构验证: ✅ 48MB / 2,672 元素 / 浏览器单机 / 42.7s 全栈通过
```
