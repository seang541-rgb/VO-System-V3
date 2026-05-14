# V1 Demo Polish — 算量报告 Tab + 防御性优化

> **Goal:** 为政府创业资金 demo 打磨 V1。两个独立卖点：A) 轻量快速算量，B) VO 智能对比。加入防御性优化让 demo 不出错。

---

## Feature 1: 算量报告 Tab (AuditPanel)

### 触发方式
- Sidebar Views 新增「Audit Report」tab 按钮
- Sidebar Quick Actions 新增「Run Audit」按钮（需要至少一个 IFC 已加载）
- 点击 Run Audit → 自动切换到 audit tab → 开始跑审计

### 数据来源
复用现有 `runAudit()` from `src/audit/extractor.ts`。返回 `AuditResult`：
- `records: ElementAuditRecord[]` — 每个构件的详细审计记录
- `bqRows: BqRow[]` — 按 JKR code 聚合的算量行（item, description, unit, netQty, elementCount）
- `summary: AuditSummary` — recordCount, jkrCodeCount, quantitySources[], classifications[]
- `quantityModeUsed: string`

### UI 布局

```
┌─────────────────────────────────────────────────────────┐
│ ⚡ 算量报告 · Quantity Takeoff Report                    │
│ 3423 构件 · 算量完成 · 耗时 2.3s                          │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│ KPI 1    │ KPI 2    │ KPI 3    │ KPI 4    │ KPI 5       │
│ 审计构件数│ JKR 分类数│ 算量模式  │ 耗时      │ 数据源覆盖   │
├──────────┴──────────┴──────────┴──────────┴─────────────┤
│                                                         │
│  BQ 算量汇总表 (bqRows)                                  │
│  ┌───────────┬────────────┬──────┬─────────┬──────────┐ │
│  │ JKR Code  │ Description│ Unit │ Net Qty │ Elements │ │
│  │ JKR-WALL..│ External.. │ m³   │ 23.4000 │ 45       │ │
│  │ JKR-SLAB..│ Ground Fl..│ m²   │ 88.2000 │ 12       │ │
│  └───────────┴────────────┴──────┴─────────┴──────────┘ │
│                                                         │
│  ▶ 展开：分类详情 (classifications)                       │
│  ▶ 展开：数据源分析 (quantitySources)                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### KPI 卡片 (5 个)
1. **审计构件数** — `summary.recordCount`
2. **JKR 分类数** — `summary.jkrCodeCount`
3. **算量模式** — `quantityModeUsed` (compat / mesh)
4. **耗时** — 实时计时器，算完定格（如 "2.3s"）
5. **Qto 覆盖率** — quantitySources 中 Qto 占比百分比

### 主表格：BQ 算量汇总
来自 `bqRows[]`，列：
- JKR Code (`item`)
- Description (`description`)
- Unit (`unit`)
- Net Quantity (`netQty`, 4 位小数)
- Element Count (`elementCount`)

### 折叠区域 1：分类详情
来自 `summary.classifications[]`，列：
- Classification, JKR Code, Element Group, Count, Net Volume (m³), Net Area (m²)

### 折叠区域 2：数据源分析
来自 `summary.quantitySources[]`，列：
- Source, Count, Net Volume (m³)

### 状态管理 (App.tsx)
```typescript
type AuditState = 'idle' | 'running' | 'done' | 'error';

// 新增 state
const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
const [auditState, setAuditState] = useState<AuditState>('idle');
const [auditError, setAuditError] = useState('');
const [auditDurationMs, setAuditDurationMs] = useState(0);
const [auditSlot, setAuditSlot] = useState<'base' | 'revision'>('base');
```

### ActiveTab 扩展
```typescript
// format.ts
export type ActiveTab = 'overview' | 'valuation' | 'copilot' | 'audit';
```

### runAudit 函数 (App.tsx)
```typescript
const runAudit = useCallback(async () => {
  const engine = engineRef.current;
  if (!engine) return;
  setAuditState('running');
  setAuditError('');
  const t0 = performance.now();
  try {
    const { runAudit } = await import('./audit/extractor');
    const result = await runAudit(engine.getIfcApi()!, engine.getModelId()!);
    setAuditDurationMs(performance.now() - t0);
    setAuditResult(result);
    setAuditState('done');
    setActiveTab('audit');
  } catch (err) {
    setAuditDurationMs(performance.now() - t0);
    setAuditError(err instanceof Error ? err.message : String(err));
    setAuditState('error');
  }
}, []);
```

---

## Feature 2: 文件大小校验

在 IFC upload handler 中，`file.size` 超过 50MB 弹提示拒绝加载：
```typescript
const MAX_IFC_SIZE = 50 * 1024 * 1024; // 50MB
if (file.size > MAX_IFC_SIZE) {
  setV1Error(`文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，上限 50MB`);
  return;
}
```

---

## Feature 3: 全局 Error Boundary

新建 `src/components/ErrorBoundary.tsx`，class component，catch render errors，显示：
- 错误信息
- 「重新加载」按钮 (`window.location.reload()`)

包裹在 App 最外层 `<AuthGuard>` 之上。

---

## Feature 4: Toast 通知系统

安装 `react-hot-toast`，在 App.tsx 加 `<Toaster />`。用于：
- 文件上传成功 → `toast.success('Base IFC 加载完成 · 3423 构件')`
- 对比完成 → `toast.success('VO 对比完成')`
- 导出完成 → `toast.success('Excel 已导出')`
- 错误 → `toast.error(message)`

替代现有的内联 billingError/billingNotice 等。

---

## Feature 5: Export loading + 超时保护

Excel 导出期间：
- 按钮文字变为 "Exporting..." + spinner
- 加 30s 超时：如果 credit check polling 超过 30s 自动中止并报错
- 导出成功后 toast 通知

---

## 不做的事（V2）
- 移动端适配
- Copilot 消息持久化
- OG meta tags
- 打字动画
- 完整 accessibility audit
