# Idea Nest — UI 视觉打磨 + 组件拆分设计 Spec

> 日期：2026-05-14
> 范围：方案 B — 样式全面替换 + 组件拆分，不改布局结构，不改业务逻辑
> 预估工期：3-5 天
> 约束：现有 9 个工具、Copilot 链路、3D 视图、Excel 导出零回归

---

## 1. 目标

把 Idea Nest 从 "advanced prototype / engineer tool" 的视觉状态提升到 QS 行业客户能信任的专业质感，同时将 1400 行单体 App.tsx 拆分成可维护的组件结构。

**不做的事：**
- 不改整体布局（sidebar + 3 tab 切换保持不变）
- 不改任何业务逻辑、state 管理、工具链路
- 不加新功能（onboarding、dashboard、permissions 等留到后续 phase）

---

## 2. 配色系统

### 2.1 底色：zinc → slate

全局替换，底色从纯黑灰变成带蓝调的暗色。

| 用途 | 现在 | 新 |
|---|---|---|
| 页面背景 | `zinc-950` (#09090b) | `slate-900` (#0f172a) |
| 卡片/面板 | `zinc-900` (#18181b) | `slate-800` (#1e293b) |
| 边框 | `white/10` | `slate-700` (#334155) |
| 次级文字 | `zinc-400` / `zinc-500` | `slate-400` (#94a3b8) / `slate-500` (#64748b) |
| 主体文字 | `zinc-100` / `zinc-300` | `slate-100` (#f1f5f9) / `slate-300` (#cbd5e1) |

### 2.2 主色：sky/fuchsia → blue

| 用途 | 现在 | 新 |
|---|---|---|
| 主操作按钮 | `sky-500` / `sky-600` | `blue-600` (#2563eb) |
| 主色高亮文字 | `sky-300` / `sky-400` | `blue-400` (#60a5fa) |
| Copilot 激活态 | `fuchsia-500/15` | `blue-600/20` |
| 链接/交互色 | `sky-500/40` | `blue-600/40` |

### 2.3 状态色（不变）

| 语义 | 色值 | 用途 |
|---|---|---|
| 成功/完成 | `green-500` (#22c55e) | 状态灯、Ready 标签 |
| 警告/待处理 | `amber-500` (#f59e0b) | Credits、Pending Rates、Protected Value |
| 风险/错误 | `red-500` (#ef4444) | Omissions、High-Risk、错误消息 |
| 信息/主操作 | `blue-600` (#2563eb) | 按钮、Copilot 标题 |

### 2.4 Copilot 聊天气泡色

| 元素 | 现在 | 新 |
|---|---|---|
| 用户消息 | `sky-600/90` | `blue-600` |
| 助手消息 bg | `zinc-900/80` + `white/10` 边框 | `slate-800` + `slate-700` 边框 |
| 工具调用标签 | `amber-500/20` bg + `amber-200` 文字 | `slate-800` bg + `amber-500` icon + `slate-400` 文字 |
| 错误消息 | `red-500/10` + `red-500/30` 边框 | `red-950/30` + `red-500/30` 边框 |

---

## 3. 间距与圆角规范

| 元素 | 现在 | 新 |
|---|---|---|
| 卡片圆角 | `rounded-xl` (12px) 混用 `rounded-2xl` (16px) | 统一 `rounded-xl` (12px) |
| 按钮圆角 | `rounded-xl` / `rounded-lg` 混用 | 统一 `rounded-lg` (8px) |
| 输入框圆角 | `rounded-xl` | `rounded-lg` (8px) |
| Sidebar 内边距 | `px-4 py-5` | `px-4 py-4` |
| Section 间距 | `gap-5` | `gap-4` |
| 卡片内边距 | `px-3 py-2.5` 混用 `px-3 py-2` | 统一 `px-3 py-2.5` |

---

## 4. KPI 卡片优化

### 现状问题
14 个 KPI 卡片一字排开（grid-cols-12），在 1080p 屏幕上每个卡片很窄，数字小看不清。

### 方案
- 默认显示 **6 个核心卡片**（3×2 grid）：Total Changes、VO Omissions、VO Additions、Net Rated Value、Pending Rates、Protected Value
- 底部加 **"展开更多指标"** 按钮，展开后显示剩余 8 个：Raw Modified、Rated Actions、High-Risk Qty、BQ Mounted、Contract BQ Rated、Formwork Alerts、Star Rate Candidates、EOT Flags
- 数字字号从 `text-lg` 提升到 `text-2xl`
- Grid 从 `grid-cols-12` 改为 `grid-cols-3`（默认）/ `grid-cols-6`（展开后）

---

## 5. 组件拆分方案

### 原则
- **只搬代码，不改逻辑**
- 所有 state 留在 App.tsx，子组件通过 props 接收
- 每个组件一个文件，每个文件 < 200 行
- handler 函数跟着它操作的 state 走（留在 App.tsx），子组件通过 `onXxx` props 回调

### 拆分目标

```
src/
├── App.tsx                    ~200行 · state + handler + 组装
├── lib/
│   └── format.ts              ~180行 · 所有 format* 纯函数
├── components/
│   ├── AppHeader.tsx           ~60行 · logo + credits badge + sign out
│   ├── AppSidebar.tsx          ~120行 · workspace files + quick actions + views nav
│   ├── CopilotPanel.tsx        ~275行 · 已存在，只改样式
│   ├── KPIGrid.tsx             ~80行 · 6 核心卡片 + 折叠展开
│   ├── ResultsTable.tsx        ~200行 · 26 列商业表格
│   ├── ModelViewer.tsx         ~80行 · 3D 视图容器 + overlay 卡片
│   └── BQMappingPanel.tsx      ~150行 · BQ 映射 tab 内容
│   └── AuthGuard.tsx           不动
├── pages/
│   └── LoginPage.tsx           只改配色
└── auth/
    └── AuthProvider.tsx        不动
```

### 5.1 lib/format.ts

从 App.tsx 顶部搬出的所有纯函数（无 React 依赖）：

- `formatCurrencyValue`, `formatSignedCurrencyValue`
- `formatRateValue`, `formatAmountValue`, `formatQuantityValue`
- `formatQuantitySource`, `formatQuantityRisk`
- `formatChangeLine`, `formatMeasurementRule`, `formatCommercialBasis`
- `formatCommercialDetail`, `formatActionProtectedQuantity`, `formatActionProtectedValue`
- `formatActionFormworkAlert`, `formatActionStarRate`, `formatActionEotFlag`
- `formatOpeningLink`, `formatStaticShield`
- `modelStateLabel`, `summarizeLabels`
- `formatElementLabel`, `getActionChanges`
- `buildSystemUnitMismatchMessage`, `guessUnitBySection`
- `buildBqMappingContext`

### 5.2 AppHeader.tsx

Props:
- `creditsBalance: number | null`
- `creditsLoading: boolean`
- `showLegacyBanner: boolean`
- `onCloseBanner: () => void`
- `onSignOut: () => void`

### 5.3 AppSidebar.tsx

Props:
- `v1File`, `v2File`, `bqFileName` — 文件信息
- `v1Components`, `v2Components`, `bqItems` — 数量统计
- `v1State`, `v2State` — 加载状态
- `voResults` — 比对结果（判断按钮禁用）
- `isRunning`, `isExporting` — 操作中状态
- `activeTab` — 当前视图
- `onUploadBase`, `onUploadRevision`, `onUploadBq` — 触发 file input click
- `onRunCompare`, `onExportExcel`, `onExportBqTemplate` — 操作回调
- `onTabChange: (tab: ActiveTab) => void`

### 5.4 KPIGrid.tsx

Props:
- 所有 KPI 数值（totalChanges, totalCommercialOmissions 等）
- `formatCurrencyValue`, `formatSignedCurrencyValue` 传入或直接 import from lib/format

内部 state:
- `expanded: boolean` — 控制折叠/展开

### 5.5 ResultsTable.tsx

Props:
- `resultRows` — 已计算好的行数据（现有的 resultRows 数组）
- `selectedRowKey`
- `onRowClick: (action: VoCommercialAction) => void`
- `scrollRef`, `scrollbarRef`, `scrollbarInnerRef` — ref 转发

### 5.6 ModelViewer.tsx

Props:
- `containerRef` — 3D canvas 挂载点
- `sysLog` — 底部状态条文字
- `v1File`, `v2File`, `bqFileName` — overlay 卡片信息
- `v1State`, `v2State`, `v1Components`, `v2Components` — overlay 状态
- `v1Error`, `v2Error`, `bqError`, `mappingError` — 错误信息
- `bqItems` — 行数
- `compareMessage` — workspace status
- `onResetCamera`, `onToggleClipping` — 3D 控制回调

### 5.7 BQMappingPanel.tsx

Props:
- `mappingRows` — 已计算好的映射行数据
- `bqItems` — BQ 列表
- `orphanRows`, `orphanInstanceCount`, `orphanPreview`
- `mappedLabelCount`, `mappingCandidates`
- `mappingError`
- `onUpdateMapping`, `onStageDraft` — 映射操作回调

---

## 6. LoginPage 配色同步

LoginPage.tsx 同步更新为 slate 底色 + blue 主色，保持与主界面一致。

---

## 7. 验证计划

每完成一个组件拆分步骤后：

1. `npm run lint` — 0 errors
2. `npm run build` — 编译通过
3. 浏览器 dev server 启动不报错

全部拆分 + 样式替换完成后，端到端测试：

1. 上传 Base IFC (`07_building_arch.ifc`) → 确认组件数正确
2. 上传 Revision IFC → 确认加载
3. Run VO Comparison → 确认结果卡片 + 表格显示
4. Copilot 发送消息 → 确认 Agent 回复 + 工具调用正常
5. Export VO Excel → 确认下载
6. 3D 视图：Reset Camera + Toggle Clipping 正常
7. BQ Mapping tab：选择 / 确认映射正常
8. Sign Out → 确认返回登录页

---

## 8. 实施顺序

1. **lib/format.ts** — 搬出纯函数（零风险，只是移动代码 + export）
2. **AppHeader.tsx** — 最简单的组件，验证拆分流程
3. **AppSidebar.tsx** — 中等复杂度
4. **ModelViewer.tsx** — 包含 ref 转发
5. **KPIGrid.tsx** — 新增折叠展开逻辑
6. **ResultsTable.tsx** — 最大的 JSX 块
7. **BQMappingPanel.tsx** — 最复杂的交互
8. **全局配色替换** — zinc→slate, sky→blue, fuchsia→blue 批量替换
9. **CopilotPanel.tsx 配色** — 单独处理聊天气泡色
10. **LoginPage.tsx 配色** — 同步
11. **端到端验证**
