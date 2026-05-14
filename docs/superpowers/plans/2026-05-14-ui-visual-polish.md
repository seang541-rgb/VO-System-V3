# UI 视觉打磨 + 组件拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Idea Nest 的 App.tsx 1400 行单体拆成 8 个组件文件，全局配色从 zinc→slate / sky→blue / fuchsia→blue，KPI 卡片从 14 个减到 6+折叠，所有业务逻辑零回归。

**Architecture:** 纯前端重构。所有 state 留在 App.tsx，子组件通过 props 接收。format 纯函数搬到 `src/lib/format.ts`。配色通过 Tailwind class 批量替换。`index.css` 的 base layer 同步更新。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS 4 + Vite + lucide-react

---

## File Structure

### 新建文件
- `src/lib/format.ts` — 从 App.tsx 搬出的 ~25 个纯格式化函数
- `src/components/AppHeader.tsx` — header 组件
- `src/components/AppSidebar.tsx` — sidebar 组件
- `src/components/ModelViewer.tsx` — 3D 视图容器
- `src/components/KPIGrid.tsx` — KPI 卡片（6 核心 + 折叠展开）
- `src/components/ResultsTable.tsx` — 26 列商业表格
- `src/components/BQMappingPanel.tsx` — BQ 映射面板

### 修改文件
- `src/App.tsx` — 删除搬走的代码，import 新组件，组装
- `src/components/CopilotPanel.tsx` — 只改配色 class
- `src/pages/LoginPage.tsx` — 只改配色 class
- `src/index.css` — base layer zinc→slate

---

### Task 1: 创建 lib/format.ts — 搬出纯函数

**Files:**
- Create: `src/lib/format.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/lib/format.ts`，从 App.tsx 剪切所有纯函数**

把 App.tsx 行 52–270 的所有非 React 纯函数搬到这个文件。需要 import 依赖的类型：

```typescript
// src/lib/format.ts
import type {
  BimComponent,
  BimFieldChange,
  BqLineItem,
  BqMappingContext,
  VoCommercialAction,
} from '../BimEngine';
import { PROJECT_QS_OVERRIDES } from '../qs-project-config';

export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error';
export type CompareState = 'idle' | 'running' | 'success' | 'error';
export type ActiveTab = 'overview' | 'valuation' | 'copilot';

export function buildBqMappingContext(items: BqLineItem[], labelMappings: Record<string, string>): BqMappingContext | undefined {
  if (items.length === 0) return undefined;
  return {
    itemsByReference: Object.fromEntries(items.map((item) => [item.itemReference, item])),
    labelMappings,
  };
}

export function guessUnitBySection(sectionCode: string) {
  if (sectionCode === 'F') return 'm3';
  if (sectionCode === 'G' || sectionCode === 'M') return 'm2';
  if (sectionCode === 'Q' || sectionCode === 'U') return 'nr';
  return '';
}

export function buildSystemUnitMismatchMessage(systemUnit: string, bqUnit: string) {
  return `Unit Mismatch: System (${systemUnit || '-'}) vs BQ (${bqUnit || '-'}). Please verify BQ item or adjust extraction rule.`;
}

export function formatElementLabel(component?: Partial<BimComponent> | null) {
  if (!component) return 'Unknown element';
  return component.qsLabel || component.name || component.type || 'Unknown element';
}

export function getActionChanges(action?: Partial<VoCommercialAction> | null) {
  return Array.isArray(action?.changes) ? action.changes : [];
}

export function formatCurrencyValue(value: number) {
  return `${PROJECT_QS_OVERRIDES.currencySymbol} ${value.toFixed(2)}`;
}

export function formatSignedCurrencyValue(value: number) {
  const rendered = `${PROJECT_QS_OVERRIDES.currencySymbol} ${Math.abs(value).toFixed(2)}`;
  return value < 0 ? `-${rendered}` : rendered;
}

export function formatRateValue(action: VoCommercialAction) {
  if (action.rateStatus === 'forced-star-rate') return 'Item Not Found in BQ - Forced Star Rate';
  if (action.rateStatus !== 'rated' || typeof action.rate !== 'number') return 'Pending';
  return `${formatCurrencyValue(action.rate)} / ${action.unit}`;
}

export function formatAmountValue(action: VoCommercialAction) {
  if (action.rateStatus === 'forced-star-rate') return 'Forced Star Rate';
  if (action.rateStatus !== 'rated' || typeof action.amount !== 'number') return 'Pending';
  return formatSignedCurrencyValue(action.amount);
}

export function formatQuantityValue(action: VoCommercialAction) {
  return Number.isFinite(action.quantity) ? action.quantity.toFixed(4) : '0.0000';
}

export function formatQuantitySource(action: VoCommercialAction) {
  switch (action.quantitySource) {
    case 'qto':
    case 'type-qto':
      return 'Qto';
    case 'geometry':
      return 'Geometry';
    case 'bbox':
      return 'BBox Estimate';
    default:
      return 'Derived';
  }
}

export function formatQuantityRisk(action: VoCommercialAction) {
  if (!action.quantityRisk) return '-';
  return `${action.quantityRisk.message} | ${action.quantityRisk.reason}`;
}

export function formatChangeLine(change: BimFieldChange) {
  const deltaText = typeof change.delta === 'number' && Number.isFinite(change.delta)
    ? ` | delta ${change.delta.toFixed(4)}${change.unit ? ` ${change.unit}` : ''}`
    : '';
  const qsText = change.qsImpact === 'ignored'
    ? ` | QS ignored: ${change.qsReason ?? 'Rule filtered'}`
    : ' | QS counted';
  const protectedQtyText = typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity)
    ? ` | protected ${change.protectedQuantity.toFixed(4)}${change.protectedUnit ? ` ${change.protectedUnit}` : ''}`
    : '';
  const protectedValueText = typeof change.protectedValue === 'number' && Number.isFinite(change.protectedValue)
    ? ` | protected value ${formatCurrencyValue(change.protectedValue)}`
    : change.qsImpact === 'ignored' && typeof change.protectedQuantity === 'number'
      ? ' | protected value rate required'
      : '';
  return `${change.label}: ${change.before} -> ${change.after}${deltaText}${qsText}${protectedQtyText}${protectedValueText}`;
}

export function formatMeasurementRule(action: VoCommercialAction) {
  if (action.measurementRuleLabel && action.measurementRuleId) {
    return `${action.measurementRuleLabel} [${action.measurementRuleId}]`;
  }
  return action.measurementRuleLabel || action.measurementRuleId || 'Fallback measurement rule';
}

export function formatCommercialBasis(action: VoCommercialAction) {
  const qty = `${action.quantityLabel}${action.measurementNote ? ` ${action.measurementNote}` : ''}: ${formatQuantityValue(action)} ${action.unit}`;
  const rule = `Rule: ${formatMeasurementRule(action)}`;
  if (action.rateStatus === 'rated' && typeof action.rate === 'number' && typeof action.amount === 'number') {
    return `${qty} | ${rule} @ ${formatCurrencyValue(action.rate)} / ${action.unit} = ${formatSignedCurrencyValue(action.amount)} (${action.rateLabel})`;
  }
  return `${qty} | ${rule} | rate pending (${action.rateLabel})`;
}

export function formatCommercialDetail(action: VoCommercialAction) {
  const changes = getActionChanges(action);
  const basisLine = `Commercial basis: ${formatCommercialBasis(action)}`;
  const protectionLine = action.protectedValue > 0
    ? `Protected Value: ${formatCurrencyValue(action.protectedValue)} (Saved by SMM2 Rule).`
    : '';

  if (action.sourceStatus === 'Modified' && action.action === 'Omission' && action.quantity === 0 && action.protectedValue > 0) {
    return [basisLine, 'Shielded non-deduction: omission quantity reduced to 0 for commercial counting.', protectionLine, changes.map(formatChangeLine).join('\n')].filter(Boolean).join('\n');
  }
  if (action.sourceStatus === 'Modified' && action.action === 'Omission') {
    const counterpart = action.counterpart ? formatElementLabel(action.counterpart) : 'revision item';
    return [basisLine, `Omit original contract item. Counterpart addition: ${counterpart}.`, protectionLine, changes.map(formatChangeLine).join('\n')].filter(Boolean).join('\n');
  }
  if (action.sourceStatus === 'Modified' && action.action === 'Addition') {
    const counterpart = action.counterpart ? formatElementLabel(action.counterpart) : 'base item';
    return `${basisLine}\nAdd revised item. Replaces omitted base item: ${counterpart}.\n${changes.map(formatChangeLine).join('\n')}`;
  }
  if (action.sourceStatus === 'Added') return `${basisLine}\nAddition from revision model.`;
  if (action.sourceStatus === 'Deleted') return `${basisLine}\nOmission from base contract item.`;
  return basisLine;
}

export function formatActionProtectedQuantity(action: VoCommercialAction) {
  const changes = getActionChanges(action);
  if (action.action !== 'Omission' || changes.length === 0) return '-';
  const protectedParts = changes
    .filter((change) => typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity))
    .map((change) => `${change.protectedQuantity!.toFixed(4)}${change.protectedUnit ? ` ${change.protectedUnit}` : ''}`);
  return protectedParts.length > 0 ? protectedParts.join(' | ') : '-';
}

export function formatActionProtectedValue(action: VoCommercialAction) {
  const changes = getActionChanges(action);
  if (action.action !== 'Omission') return '-';
  if (action.protectedValue > 0) return formatCurrencyValue(action.protectedValue);
  const hasProtectedQty = changes.some((change) => typeof change.protectedQuantity === 'number' && Number.isFinite(change.protectedQuantity));
  return hasProtectedQty ? 'Rate needed' : '-';
}

export function formatActionFormworkAlert(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.formworkAlert) return '-';
  return `${action.formworkAlert.message} | ${action.formworkAlert.reason}`;
}

export function formatActionStarRate(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.starRateCandidate) return '-';
  return `${action.starRateCandidate.title} | ${action.starRateCandidate.recommendedAction}`;
}

export function formatActionEotFlag(action: VoCommercialAction) {
  if (action.action !== 'Addition' || !action.eotFlag) return '-';
  return `${action.eotFlag.title} | ${action.eotFlag.recommendedAction}`;
}

export function formatOpeningLink(component?: Partial<BimComponent> | null) {
  if (!component) return '-';
  if (component.isOpening) {
    const hostBits = [component.openingHostType, component.openingHostName || component.openingHostIfcId].filter(Boolean).join(' ');
    return hostBits ? `Opening -> ${hostBits}` : 'Opening -> Unassigned host';
  }
  if (component.openingCount > 0 || component.openingSignature) {
    return component.openingSignature ? `Host -> ${component.openingSignature}` : `Host -> ${component.openingCount} opening(s)`;
  }
  return '-';
}

export function formatStaticShield(component?: Partial<BimComponent> | null) {
  if (!component) return '-';
  if (component.isOpening) return 'Opening change';
  if (component.openingCount > 0) return 'Host openings tracked';
  return '-';
}

export function modelStateLabel(state: ModelLoadState, count: number, fileName: string | null) {
  if (state === 'loading') return 'Parsing...';
  if (state === 'error') return 'Load failed';
  if (state === 'ready') return `${count} indexed elements`;
  if (fileName) return fileName;
  return 'Not loaded';
}

export function summarizeLabels(labels: string[], limit = 3) {
  if (labels.length === 0) return '';
  const preview = labels.slice(0, limit).join(' | ');
  return labels.length > limit ? `${preview} ...` : preview;
}
```

- [ ] **Step 2: 更新 App.tsx — 删除搬走的函数，添加 import**

在 App.tsx 顶部，删除行 43-270 的所有纯函数定义（`type ModelLoadState` 到 `function summarizeLabels`），替换为：

```typescript
import {
  type ModelLoadState,
  type CompareState,
  type ActiveTab,
  buildBqMappingContext,
  guessUnitBySection,
  buildSystemUnitMismatchMessage,
  formatElementLabel,
  getActionChanges,
  formatCurrencyValue,
  formatSignedCurrencyValue,
  formatRateValue,
  formatAmountValue,
  formatQuantityValue,
  formatQuantitySource,
  formatQuantityRisk,
  formatChangeLine,
  formatMeasurementRule,
  formatCommercialBasis,
  formatCommercialDetail,
  formatActionProtectedQuantity,
  formatActionProtectedValue,
  formatActionFormworkAlert,
  formatActionStarRate,
  formatActionEotFlag,
  formatOpeningLink,
  formatStaticShield,
  modelStateLabel,
  summarizeLabels,
} from './lib/format';
```

- [ ] **Step 3: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 4: Commit**

```bash
git add src/lib/format.ts src/App.tsx
git commit -m "refactor: extract format utils from App.tsx to lib/format.ts"
```

---

### Task 2: 创建 AppHeader.tsx

**Files:**
- Create: `src/components/AppHeader.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/components/AppHeader.tsx`**

从 App.tsx 行 1029-1076（`<header>` 到 `</header>`）剪切 JSX，新配色已应用：

```tsx
// src/components/AppHeader.tsx
import { Coins, LogOut, Zap, X } from 'lucide-react';

interface AppHeaderProps {
  creditsBalance: number | null;
  creditsLoading: boolean;
  showLegacyBanner: boolean;
  onCloseBanner: () => void;
  onSignOut: () => void;
}

export default function AppHeader({
  creditsBalance,
  creditsLoading,
  showLegacyBanner,
  onCloseBanner,
  onSignOut,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 items-center justify-center rounded-lg bg-white/95 px-1.5 py-1 shadow-sm ring-1 ring-white/20">
            <img
              src="/ideanest-logo.png"
              alt="Idea Nest · VO Copilot"
              className="h-full w-auto object-contain"
            />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-medium tracking-wide text-slate-400">
              VO Copilot · 变更单与合约索赔智能体
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
            <Coins className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Credits</span>
            <span className="text-sm font-bold text-white">{creditsLoading ? '...' : creditsBalance ?? '-'}</span>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:border-slate-600 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
      {showLegacyBanner && (
        <div className="flex items-center justify-between border-t border-blue-500/10 bg-gradient-to-r from-blue-500/5 to-blue-400/5 px-6 py-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Zap className="h-3 w-3 text-blue-400" />
            <span><span className="text-slate-300">原 VO System</span> 已升级为 Idea Nest，所有 VO 比对、索赔分析、Excel 导出功能都在 Copilot 里直接调用。</span>
          </div>
          <button type="button" onClick={onCloseBanner} className="rounded p-0.5 text-slate-500 hover:bg-white/5 hover:text-slate-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: 更新 App.tsx — 替换 header JSX 为组件调用**

在 App.tsx 的 return 中，把 `<header>...</header>` 替换为：

```tsx
import AppHeader from './components/AppHeader';

// 在 return JSX 中:
<AppHeader
  creditsBalance={creditsBalance}
  creditsLoading={creditsLoading}
  showLegacyBanner={showLegacyBanner}
  onCloseBanner={() => setShowLegacyBanner(false)}
  onSignOut={signOut}
/>
```

同时从 App.tsx 的 import 中删除不再直接使用的 icons：`Coins`, `LogOut`, `Zap`（如果只有 header 用到的话）。保留其他组件还用到的 icons。

- [ ] **Step 3: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 4: Commit**

```bash
git add src/components/AppHeader.tsx src/App.tsx
git commit -m "refactor: extract AppHeader component from App.tsx"
```

---

### Task 3: 创建 AppSidebar.tsx

**Files:**
- Create: `src/components/AppSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/components/AppSidebar.tsx`**

从 App.tsx 行 1084-1234（`<aside>...</aside>`）剪切 JSX，新配色已应用：

```tsx
// src/components/AppSidebar.tsx
import {
  FileBox,
  FileSpreadsheet,
  FileText,
  Play,
  Download,
  Sparkles,
  Layers3,
  ClipboardList,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import type { BimComponent, BqLineItem, VoComparisonResults } from '../BimEngine';
import type { ActiveTab, ModelLoadState } from '../lib/format';

interface AppSidebarProps {
  v1File: File | null;
  v2File: File | null;
  bqFileName: string;
  v1Components: BimComponent[];
  v2Components: BimComponent[];
  bqItems: BqLineItem[];
  v1State: ModelLoadState;
  v2State: ModelLoadState;
  voResults: VoComparisonResults | null;
  isRunning: boolean;
  isExporting: boolean;
  activeTab: ActiveTab;
  onUploadBase: () => void;
  onUploadRevision: () => void;
  onUploadBq: () => void;
  onRunCompare: () => void;
  onExportExcel: () => void;
  onExportBqTemplate: () => void;
  onTabChange: (tab: ActiveTab) => void;
}

export default function AppSidebar({
  v1File, v2File, bqFileName,
  v1Components, v2Components, bqItems,
  v1State, v2State, voResults,
  isRunning, isExporting, activeTab,
  onUploadBase, onUploadRevision, onUploadBq,
  onRunCompare, onExportExcel, onExportBqTemplate,
  onTabChange,
}: AppSidebarProps) {
  const canCompare = v1State === 'ready' && v2State === 'ready' && !isRunning;
  const showCopilotTab = activeTab === 'copilot';
  const showOverviewTab = activeTab === 'overview';
  const showValuationTab = activeTab === 'valuation';

  return (
    <aside className="sticky top-[57px] flex h-[calc(100vh-57px)] w-72 flex-col gap-4 overflow-y-auto border-r border-slate-700 bg-slate-900 px-4 py-4">
      {/* Workspace files */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Workspace</div>
        <div className="space-y-2">
          <button type="button" onClick={onUploadBase} disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${v1Components.length > 0 ? 'border-blue-600/30 bg-blue-600/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FileBox className={`h-4 w-4 ${v1Components.length > 0 ? 'text-blue-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Base IFC</div>
              <div className={`truncate text-xs ${v1Components.length > 0 ? 'text-white' : 'text-slate-400'}`}>
                {v1File ? v1File.name : 'Not loaded · click to upload'}
              </div>
              {v1Components.length > 0 && <div className="text-[10px] text-slate-500">{v1Components.length} components</div>}
            </div>
          </button>
          <button type="button" onClick={onUploadRevision} disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${v2Components.length > 0 ? 'border-blue-600/30 bg-blue-600/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FileBox className={`h-4 w-4 ${v2Components.length > 0 ? 'text-blue-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Revision IFC</div>
              <div className={`truncate text-xs ${v2Components.length > 0 ? 'text-white' : 'text-slate-400'}`}>
                {v2File ? v2File.name : 'Not loaded · click to upload'}
              </div>
              {v2Components.length > 0 && <div className="text-[10px] text-slate-500">{v2Components.length} components</div>}
            </div>
          </button>
          <button type="button" onClick={onUploadBq} disabled={isRunning}
            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-slate-600 ${bqItems.length > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'} disabled:cursor-not-allowed disabled:opacity-50`}>
            <FileSpreadsheet className={`h-4 w-4 ${bqItems.length > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div className="flex-1 overflow-hidden">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Awarded BQ</div>
              <div className={`truncate text-xs ${bqItems.length > 0 ? 'text-white' : 'text-slate-400'}`}>
                {bqFileName || 'Built-in Test BQ Library'}
              </div>
              <div className="text-[10px] text-slate-500">{bqItems.length} line items ready</div>
            </div>
          </button>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Quick Actions</div>
        <div className="space-y-1.5">
          <button type="button" onClick={onRunCompare} disabled={!canCompare}
            className="group flex w-full items-center gap-2.5 rounded-lg bg-blue-600 px-3 py-2 text-left text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-4 w-4 flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">Run VO Comparison</div>
              <div className="truncate text-[10px] text-blue-200">对比 base / revision</div>
            </div>
          </button>
          <button type="button" onClick={onExportExcel} disabled={!voResults || isExporting}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Download className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">{isExporting ? 'Checking...' : 'Export VO Excel'}</div>
              <div className="truncate text-[10px] text-slate-500">生成实证报告</div>
            </div>
          </button>
          <button type="button" onClick={onExportBqTemplate}
            className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white">
            <FileText className="h-4 w-4 flex-shrink-0 text-slate-500 group-hover:text-slate-300" />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-semibold">BQ Template</div>
              <div className="truncate text-[10px] text-slate-500">下载模板</div>
            </div>
          </button>
        </div>
      </section>

      {/* Views */}
      <section>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Views</div>
        <div className="space-y-1">
          <button type="button" onClick={() => onTabChange('copilot')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showCopilotTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Sparkles className={`h-3.5 w-3.5 flex-shrink-0 ${showCopilotTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">IFC Copilot</span>
          </button>
          <button type="button" onClick={() => onTabChange('overview')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showOverviewTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Layers3 className={`h-3.5 w-3.5 flex-shrink-0 ${showOverviewTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">3D Model & Diff</span>
          </button>
          <button type="button" onClick={() => onTabChange('valuation')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition ${showValuationTab ? 'bg-blue-600/20 text-blue-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <ClipboardList className={`h-3.5 w-3.5 flex-shrink-0 ${showValuationTab ? 'text-blue-400' : 'text-slate-600'}`} />
            <span className="text-xs font-semibold">BQ Mapping & Valuation</span>
          </button>
        </div>
      </section>

      {/* Status */}
      <section className="mt-auto rounded-xl border border-slate-700 bg-slate-800/50 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Status</div>
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Base IFC</span>
            <span className="flex items-center gap-1">
              {v1Components.length > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Ready</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">Pending</span></>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Revision IFC</span>
            <span className="flex items-center gap-1">
              {v2Components.length > 0 ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Ready</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">Pending</span></>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Comparison</span>
            <span className="flex items-center gap-1">
              {voResults ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Done</span></> : <><Circle className="h-3 w-3 text-slate-600" /><span className="text-slate-500">Pending</span></>}
            </span>
          </div>
        </div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 2: 更新 App.tsx — 替换 aside JSX 为组件调用**

```tsx
import AppSidebar from './components/AppSidebar';

// 在 return JSX 中，替换 <aside>...</aside> 为：
<AppSidebar
  v1File={v1File} v2File={v2File} bqFileName={bqFileName}
  v1Components={v1Components} v2Components={v2Components} bqItems={bqItems}
  v1State={v1State} v2State={v2State} voResults={voResults}
  isRunning={isRunning} isExporting={isExporting} activeTab={activeTab}
  onUploadBase={() => v1InputRef.current?.click()}
  onUploadRevision={() => v2InputRef.current?.click()}
  onUploadBq={() => bqInputRef.current?.click()}
  onRunCompare={runVOComparison}
  onExportExcel={exportWorkbook}
  onExportBqTemplate={exportBqTemplateWorkbook}
  onTabChange={setActiveTab}
/>
```

从 App.tsx import 中删除 sidebar 独占的 icons：`FileBox`, `FileSpreadsheet`, `FileText`, `Play`, `Download`, `Sparkles`, `Layers3`, `ClipboardList`, `CheckCircle2`, `Circle`。只保留 App.tsx 还直接使用的 icons。

- [ ] **Step 3: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 4: Commit**

```bash
git add src/components/AppSidebar.tsx src/App.tsx
git commit -m "refactor: extract AppSidebar component from App.tsx"
```

---

### Task 4: 创建 ModelViewer.tsx

**Files:**
- Create: `src/components/ModelViewer.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/components/ModelViewer.tsx`**

从 App.tsx 行 1240-1277（3D 视图容器 div）剪切 JSX。`containerRef` 通过 props 传入（App.tsx 里 BimEngine 初始化需要这个 ref）：

```tsx
// src/components/ModelViewer.tsx
import React from 'react';
import { Home, BoxSelect } from 'lucide-react';
import type { BimComponent, BqLineItem } from '../BimEngine';
import type { ModelLoadState } from '../lib/format';
import { modelStateLabel } from '../lib/format';

interface ModelViewerProps {
  containerRef: React.RefObject<HTMLDivElement>;
  sysLog: string;
  v1File: File | null;
  v2File: File | null;
  v1State: ModelLoadState;
  v2State: ModelLoadState;
  v1Components: BimComponent[];
  v2Components: BimComponent[];
  v1Error: string;
  v2Error: string;
  bqFileName: string;
  bqItems: BqLineItem[];
  bqError: string;
  mappingError: string;
  compareMessage: string;
  onResetCamera: () => void;
  onToggleClipping: () => void;
}

export default function ModelViewer({
  containerRef, sysLog,
  v1File, v2File, v1State, v2State,
  v1Components, v2Components,
  v1Error, v2Error,
  bqFileName, bqItems, bqError, mappingError,
  compareMessage,
  onResetCamera, onToggleClipping,
}: ModelViewerProps) {
  return (
    <div ref={containerRef} className="relative h-[60vh] min-h-[30rem] overflow-hidden rounded-xl border border-slate-700 bg-slate-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75)] lg:h-[58vh]">
      <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-slate-300/90 bg-white/88 px-4 py-2 font-mono text-xs text-slate-700 shadow-sm backdrop-blur">{sysLog}</div>
      <div className="absolute left-4 top-4 z-10 flex max-w-[60rem] flex-col gap-2 text-xs">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Base IFC</div>
            <div className="mt-1 truncate font-semibold text-slate-900">{v1File ? v1File.name : 'No file selected'}</div>
            <div className="mt-1 text-slate-500">{modelStateLabel(v1State, v1Components.length, v1File?.name ?? null)}</div>
            {v1Error && <div className="mt-1 text-red-400">{v1Error}</div>}
          </div>
          <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Revision IFC</div>
            <div className="mt-1 truncate font-semibold text-slate-900">{v2File ? v2File.name : 'No file selected'}</div>
            <div className="mt-1 text-slate-500">{modelStateLabel(v2State, v2Components.length, v2File?.name ?? null)}</div>
            {v2Error && <div className="mt-1 text-red-400">{v2Error}</div>}
          </div>
          <div className="rounded-xl border border-slate-300/80 bg-white/82 px-3 py-2 text-slate-700 shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Awarded BQ</div>
            <div className="mt-1 truncate font-semibold text-slate-900">{bqFileName || 'Built-in Test BQ Library'}</div>
            <div className="mt-1 text-slate-500">{bqItems.length} line items ready</div>
            {bqError && <div className="mt-1 text-red-400">{bqError}</div>}
            {mappingError && <div className="mt-1 text-red-300">{mappingError}</div>}
          </div>
          <div className="rounded-xl border border-blue-200/90 bg-white/84 px-3 py-2 text-blue-700 shadow-sm backdrop-blur">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-500">Workspace Status</div>
            <div className="mt-1 text-xs leading-5">{compareMessage}</div>
          </div>
        </div>
      </div>
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button className="rounded bg-black/50 p-2 text-white hover:bg-black/80" onClick={onResetCamera}><Home size={16} /></button>
        <button className="rounded bg-black/50 p-2 text-white hover:bg-black/80" onClick={onToggleClipping}><BoxSelect size={16} /></button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 更新 App.tsx — 替换 3D 视图 div 为组件调用**

在 overview tab 的条件渲染中，把 `<div ref={containerRef}...>` 替换为：

```tsx
import ModelViewer from './components/ModelViewer';

// showOverviewTab 条件中：
<ModelViewer
  containerRef={containerRef}
  sysLog={sysLog}
  v1File={v1File} v2File={v2File}
  v1State={v1State} v2State={v2State}
  v1Components={v1Components} v2Components={v2Components}
  v1Error={v1Error} v2Error={v2Error}
  bqFileName={bqFileName} bqItems={bqItems}
  bqError={bqError} mappingError={mappingError}
  compareMessage={compareMessage}
  onResetCamera={() => engineRef.current?.resetCamera()}
  onToggleClipping={() => engineRef.current?.toggleClipping()}
/>
```

注意：`containerRef` 的 `className` 控制可见性（`showOverviewTab ? '...' : 'hidden'`）需要保留在 App.tsx 层的包裹 div 上，不要移入 ModelViewer。ModelViewer 始终渲染，由外层控制显隐。

- [ ] **Step 3: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 4: Commit**

```bash
git add src/components/ModelViewer.tsx src/App.tsx
git commit -m "refactor: extract ModelViewer component from App.tsx"
```

---

### Task 5: 创建 KPIGrid.tsx（含折叠展开新逻辑）

**Files:**
- Create: `src/components/KPIGrid.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/components/KPIGrid.tsx`**

从 App.tsx 行 1287-1302 的 14 个 KPI 卡片 grid，重新组织为 6 核心 + 8 折叠：

```tsx
// src/components/KPIGrid.tsx
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrencyValue, formatSignedCurrencyValue } from '../lib/format';

interface KPIGridProps {
  totalChanges: number;
  totalCommercialOmissions: number;
  totalCommercialAdditions: number;
  totalNetValue: number;
  totalPendingRates: number;
  totalProtectedValue: number;
  // Secondary (collapsible)
  rawModified: number;
  totalRatedActions: number;
  totalHighRiskQuantityItems: number;
  mappedLabelCount: number;
  mappingCandidatesCount: number;
  contractBqCount: number;
  totalFormworkAlerts: number;
  totalStarRateCandidates: number;
  totalEotFlags: number;
}

interface KPICardProps {
  label: string;
  value: string | number;
  borderColor?: string;
  labelColor?: string;
  valueColor?: string;
}

function KPICard({ label, value, borderColor = 'border-slate-700', labelColor = 'text-slate-500', valueColor = 'text-slate-100' }: KPICardProps) {
  return (
    <div className={`rounded-xl border bg-slate-800 px-3 py-2.5 ${borderColor}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${labelColor}`}>{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

export default function KPIGrid(props: KPIGridProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-slate-800 px-4 py-3">
      {/* Primary 6 cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPICard label="Total Changes" value={props.totalChanges} />
        <KPICard label="VO Omissions" value={props.totalCommercialOmissions} borderColor="border-red-500/30" labelColor="text-red-400" valueColor="text-red-300" />
        <KPICard label="VO Additions" value={props.totalCommercialAdditions} borderColor="border-green-500/30" labelColor="text-green-400" valueColor="text-green-300" />
        <KPICard label="Net Rated Value" value={formatSignedCurrencyValue(props.totalNetValue)} borderColor="border-blue-500/30" labelColor="text-blue-400" valueColor="text-blue-300" />
        <KPICard label="Pending Rates" value={props.totalPendingRates} borderColor="border-amber-500/30" labelColor="text-amber-400" valueColor="text-amber-300" />
        <KPICard label="Protected Value" value={formatCurrencyValue(props.totalProtectedValue)} borderColor="border-amber-500/30" labelColor="text-slate-500" valueColor="text-amber-300" />
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] text-slate-500 hover:bg-slate-800 hover:text-slate-300"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? '收起更多指标' : '展开更多指标'}
      </button>

      {/* Secondary 8 cards */}
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <KPICard label="Raw Modified" value={props.rawModified} valueColor="text-amber-400" />
          <KPICard label="Rated Actions" value={props.totalRatedActions} valueColor="text-blue-300" />
          <KPICard label="High-Risk Qty" value={props.totalHighRiskQuantityItems} borderColor="border-red-500/30" valueColor="text-red-300" />
          <KPICard label="BQ Mounted" value={`${props.mappedLabelCount}/${props.mappingCandidatesCount}`} borderColor="border-emerald-500/30" valueColor="text-emerald-300" />
          <KPICard label="Contract BQ Rated" value={props.contractBqCount} valueColor="text-blue-300" />
          <KPICard label="Formwork Alerts" value={props.totalFormworkAlerts} borderColor="border-red-500/30" valueColor="text-red-300" />
          <KPICard label="Star Rate" value={props.totalStarRateCandidates} borderColor="border-orange-500/30" valueColor="text-orange-300" />
          <KPICard label="EOT Flags" value={props.totalEotFlags} borderColor="border-violet-500/30" valueColor="text-violet-300" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 更新 App.tsx — 替换 KPI grid div 为组件调用**

```tsx
import KPIGrid from './components/KPIGrid';

// 替换 grid-cols-12 的 14 个 KPI div 为：
<KPIGrid
  totalChanges={totalChanges}
  totalCommercialOmissions={totalCommercialOmissions}
  totalCommercialAdditions={totalCommercialAdditions}
  totalNetValue={totalNetValue}
  totalPendingRates={totalPendingRates}
  totalProtectedValue={totalProtectedValue}
  rawModified={voResults?.modified.length ?? 0}
  totalRatedActions={totalRatedActions}
  totalHighRiskQuantityItems={totalHighRiskQuantityItems}
  mappedLabelCount={mappedLabelCount}
  mappingCandidatesCount={mappingCandidates.length}
  contractBqCount={contractBqCount}
  totalFormworkAlerts={totalFormworkAlerts}
  totalStarRateCandidates={totalStarRateCandidates}
  totalEotFlags={totalEotFlags}
/>
```

- [ ] **Step 3: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 4: Commit**

```bash
git add src/components/KPIGrid.tsx src/App.tsx
git commit -m "refactor: extract KPIGrid with 6+8 collapsible layout"
```

---

### Task 6: 创建 ResultsTable.tsx

**Files:**
- Create: `src/components/ResultsTable.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/components/ResultsTable.tsx`**

从 App.tsx 行 1303-1391（滚动条提示 + 表格 + tbody）剪切 JSX。resultRows 类型需要从 App.tsx 导出或在此文件定义接口：

```tsx
// src/components/ResultsTable.tsx
import React from 'react';
import type { VoCommercialAction } from '../BimEngine';

export interface ResultRow {
  key: string;
  section: string;
  level: string;
  block: string;
  zone: string;
  gridRoom: string;
  locationKind: string;
  openingLink: string;
  shield: string;
  protectedQty: string;
  protectedValue: string;
  alert: string;
  starRate: string;
  eotFlag: string;
  element: string;
  measurement: string;
  measureRule: string;
  quantitySource: string;
  quantityRisk: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  actionLabel: string;
  techStatus: string;
  qsImpact: string;
  detail: string;
  actionClass: string;
  techClass: string;
  qsClass: string;
  rateClass: string;
  quantityRiskClass: string;
  amountClass: string;
  canFocus: boolean;
  focusHint: string;
  rawAction: VoCommercialAction;
}

interface ResultsTableProps {
  resultRows: ResultRow[];
  selectedRowKey: string | null;
  onRowClick: (action: VoCommercialAction) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  scrollbarRef: React.RefObject<HTMLDivElement>;
  scrollbarInnerRef: React.RefObject<HTMLDivElement>;
}

export default function ResultsTable({
  resultRows, selectedRowKey, onRowClick,
  scrollRef, scrollbarRef, scrollbarInnerRef,
}: ResultsTableProps) {
  return (
    <>
      <div className="border-b border-slate-800 px-4 py-2 text-xs text-slate-500">
        Commercial output now forces every technical modification into Omission + Addition rows. Each commercial row now carries Qty, Unit, Rate, Amount, the exact measurement rule applied, and the quantity source used. Quantity normalization now follows a strict fallback chain: Qto first, geometry mesh calculation second, and BBox estimate last. Any BBox fallback is marked as high risk for manual QS verification. Contract BQ rates override provisional project rates only when a QS-mounted Item Reference exists and its unit matches the system measurement unit. Click a row to focus the affected element in 3D; modified omissions will focus the visible revision counterpart.
      </div>
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-400">
          Drag Horizontally Here To View Hidden Columns
        </div>
        <div ref={scrollbarRef} className="overflow-x-auto overflow-y-hidden rounded-full border border-slate-700 bg-slate-800/90">
          <div ref={scrollbarInnerRef} className="h-4 min-w-full" />
        </div>
      </div>
      <div ref={scrollRef} className="hide-scrollbar overflow-x-auto p-4">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700/60 text-xs uppercase tracking-[0.18em] text-slate-500">
              <th className="w-[7%] px-3 py-2 font-bold">Section</th>
              <th className="w-[10%] px-3 py-2 font-bold">Level</th>
              <th className="w-[8%] px-3 py-2 font-bold">Block</th>
              <th className="w-[8%] px-3 py-2 font-bold">Zone</th>
              <th className="w-[10%] px-3 py-2 font-bold">Grid/Room</th>
              <th className="w-[7%] px-3 py-2 font-bold">Loc Type</th>
              <th className="w-[14%] px-3 py-2 font-bold">Host / Opening</th>
              <th className="w-[9%] px-3 py-2 font-bold">Shield</th>
              <th className="w-[10%] px-3 py-2 font-bold">Protected Qty</th>
              <th className="w-[10%] px-3 py-2 font-bold">Protected Value</th>
              <th className="w-[16%] px-3 py-2 font-bold">Formwork Alert</th>
              <th className="w-[16%] px-3 py-2 font-bold">Star Rate</th>
              <th className="w-[16%] px-3 py-2 font-bold">EOT Trigger</th>
              <th className="w-[15%] px-3 py-2 font-bold">QS Description</th>
              <th className="w-[11%] px-3 py-2 font-bold">Measure</th>
              <th className="w-[14%] px-3 py-2 font-bold">Measure Rule</th>
              <th className="w-[8%] px-3 py-2 font-bold">Qty Source</th>
              <th className="w-[16%] px-3 py-2 font-bold">Qty Risk</th>
              <th className="w-[8%] px-3 py-2 font-bold">Qty</th>
              <th className="w-[6%] px-3 py-2 font-bold">Unit</th>
              <th className="w-[10%] px-3 py-2 font-bold">Rate</th>
              <th className="w-[10%] px-3 py-2 font-bold">Amount</th>
              <th className="w-[7%] px-3 py-2 font-bold">VO Action</th>
              <th className="w-[7%] px-3 py-2 font-bold">Tech Status</th>
              <th className="w-[6%] px-3 py-2 font-bold">QS Impact</th>
              <th className="pb-2 font-bold uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="font-mono text-slate-300">
            {resultRows.map((row) => (
              <tr
                key={row.key}
                className={`border-b border-slate-700/40 align-top even:bg-slate-800/20 ${row.canFocus ? 'cursor-pointer hover:bg-slate-800/55' : 'opacity-80'} ${selectedRowKey === row.key ? 'bg-blue-950/30 ring-1 ring-inset ring-blue-500/40' : ''}`}
                onClick={() => row.canFocus ? onRowClick(row.rawAction) : undefined}
                title={row.focusHint}
              >
                <td className="px-3 py-2 text-slate-100">{row.section}</td>
                <td className="px-3 py-2 text-blue-400">{row.level}</td>
                <td className="px-3 py-2 text-slate-300">{row.block}</td>
                <td className="px-3 py-2 text-slate-300">{row.zone}</td>
                <td className="px-3 py-2 text-slate-300">{row.gridRoom}</td>
                <td className="px-3 py-2 uppercase text-slate-500">{row.locationKind}</td>
                <td className="px-3 py-2 text-slate-400">{row.openingLink}</td>
                <td className="px-3 py-2 text-slate-400">{row.shield}</td>
                <td className="px-3 py-2 text-slate-300">{row.protectedQty}</td>
                <td className="px-3 py-2 text-amber-300">{row.protectedValue}</td>
                <td className={`py-2 ${row.alert === '-' ? 'text-slate-500' : 'font-semibold text-red-300'}`}>{row.alert}</td>
                <td className={`py-2 ${row.starRate === '-' ? 'text-slate-500' : 'font-semibold text-orange-300'}`}>{row.starRate}</td>
                <td className={`py-2 ${row.eotFlag === '-' ? 'text-slate-500' : 'font-semibold text-violet-300'}`}>{row.eotFlag}</td>
                <td className="px-3 py-2 text-slate-100">{row.element}</td>
                <td className="px-3 py-2 text-slate-300">{row.measurement}</td>
                <td className="px-3 py-2 text-slate-400">{row.measureRule}</td>
                <td className="px-3 py-2 text-slate-300">{row.quantitySource}</td>
                <td className={`py-2 ${row.quantityRiskClass}`}>{row.quantityRisk}</td>
                <td className="px-3 py-2 text-slate-300">{row.quantity}</td>
                <td className="px-3 py-2 text-slate-300">{row.unit}</td>
                <td className={`py-2 ${row.rateClass}`}>{row.rate}</td>
                <td className={`py-2 font-semibold ${row.amountClass}`}>{row.amount}</td>
                <td className={`py-2 font-bold ${row.actionClass}`}>{row.actionLabel}</td>
                <td className={`py-2 font-bold ${row.techClass}`}>{row.techStatus}</td>
                <td className={`py-2 font-bold uppercase ${row.qsClass}`}>{row.qsImpact}</td>
                <td className="whitespace-pre-wrap px-3 py-2 text-slate-400">{row.detail}</td>
              </tr>
            ))}
            {resultRows.length === 0 && (
              <tr><td colSpan={26} className="py-4 text-center text-slate-500">Comparison ran successfully. No variations were detected.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Step 2: 更新 App.tsx — 替换表格 JSX 为组件调用**

```tsx
import ResultsTable from './components/ResultsTable';

// 替换滚动条提示 + 表格 区块为：
<ResultsTable
  resultRows={resultRows}
  selectedRowKey={selectedRowKey}
  onRowClick={focusCommercialAction}
  scrollRef={resultsTableScrollRef}
  scrollbarRef={resultsScrollbarRef}
  scrollbarInnerRef={resultsScrollbarInnerRef}
/>
```

- [ ] **Step 3: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 4: Commit**

```bash
git add src/components/ResultsTable.tsx src/App.tsx
git commit -m "refactor: extract ResultsTable component from App.tsx"
```

---

### Task 7: 创建 BQMappingPanel.tsx

**Files:**
- Create: `src/components/BQMappingPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/components/BQMappingPanel.tsx`**

从 App.tsx 行 1394-1478（showValuationTab 内的全部 JSX）剪切。这是最复杂的组件，包含 BQ mapping 表格和所有交互逻辑：

```tsx
// src/components/BQMappingPanel.tsx
import type { BqLineItem } from '../BimEngine';
import { formatCurrencyValue } from '../lib/format';

interface MappingRow {
  label: string;
  section: string;
  instanceCount: number;
  systemUnit: string;
  selectedUnit: string;
  hasUnitMismatch: boolean;
  unitStatus: string;
  mappedReference: string;
  draftReference: string;
  mappedItem: BqLineItem | undefined;
  draftItem: BqLineItem | undefined;
  suggestedItem: { itemReference: string; score: number; description: string } | undefined;
  suggestedSelectableItem: { itemReference: string; score: number; description: string } | undefined;
  selectableItems: Array<BqLineItem & { mismatch: boolean }>;
  typeGroupKey: string;
}

interface BQMappingPanelProps {
  mappingRows: MappingRow[];
  bqFileName: string;
  bqItems: BqLineItem[];
  bqError: string;
  mappingError: string;
  orphanRows: MappingRow[];
  orphanInstanceCount: number;
  orphanPreview: string;
  mappedLabelCount: number;
  mappingCandidatesCount: number;
  totalPendingRates: number;
  contractBqCount: number;
  compareMessage: string;
  onUpdateMapping: (label: string, itemReference: string) => void;
  onStageDraft: (label: string, itemReference: string) => void;
}

export default function BQMappingPanel({
  mappingRows, bqFileName, bqItems, bqError, mappingError,
  orphanRows, orphanInstanceCount, orphanPreview,
  mappedLabelCount, mappingCandidatesCount,
  totalPendingRates, contractBqCount, compareMessage,
  onUpdateMapping, onStageDraft,
}: BQMappingPanelProps) {
  return (
    <div className="flex flex-col border-t border-slate-700 bg-slate-900">
      <div className="shrink-0 border-b border-slate-800 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400">BQ Mapping Dashboard</div>
            <div className="mt-2 max-w-3xl text-sm text-slate-400">This QS workbench only shows live commercial actions. Stage a BQ item, review the unit pairing, and explicitly confirm the mount before the contract rate goes live.</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">BQ Mounted</div><div className="mt-2 text-2xl font-black text-white">{mappedLabelCount}/{mappingCandidatesCount}</div></div>
            <div className="rounded-xl border border-red-900/70 bg-red-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-red-300">Unmapped</div><div className="mt-2 text-2xl font-black text-white">{orphanRows.length}</div></div>
            <div className="rounded-xl border border-amber-900/70 bg-amber-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-amber-300">Pending Rates</div><div className="mt-2 text-2xl font-black text-white">{totalPendingRates}</div></div>
            <div className="rounded-xl border border-blue-900/70 bg-blue-950/20 px-4 py-3"><div className="text-[11px] uppercase tracking-[0.2em] text-blue-300">Contract Rated</div><div className="mt-2 text-2xl font-black text-white">{contractBqCount}</div></div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-slate-300">Awarded BQ: <span className="font-semibold text-white">{bqFileName ? `${bqFileName} | ${bqItems.length} line items` : "Not loaded"}</span>{bqError && <div className="mt-2 text-red-400">{bqError}</div>}{mappingError && <div className="mt-2 text-red-300">{mappingError}</div>}</div>
          <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-sm text-blue-300">Status: {compareMessage}</div>
        </div>
        {orphanRows.length > 0 && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 px-4 py-4">
            <div className="text-sm font-black uppercase tracking-[0.2em] text-red-200">Unmapped Items: {orphanInstanceCount} - Potential Star Rate!</div>
            <div className="mt-2 text-sm text-red-300">{orphanRows.length} QS descriptions still have no awarded BQ item. {orphanPreview ? `Examples: ${orphanPreview}` : ""}</div>
          </div>
        )}
      </div>
      <div className="px-4 pb-6">
        <div className="flex flex-col rounded-xl border border-slate-700 bg-slate-800/80 shadow-2xl shadow-black/30">
          <div className="shrink-0 border-b border-slate-700 bg-slate-900/80 px-5 py-4">
            <div className="text-sm font-black uppercase tracking-[0.28em] text-white">Contract Mounting Console</div>
            <div className="mt-2 text-sm text-slate-400">Sticky description column on the left. System unit and staged BQ unit are displayed side by side. Any unit conflict lights the row red and blocks confirmation.</div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[110rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-20 bg-slate-900 text-xs uppercase tracking-[0.18em] text-slate-400">
                <tr className="border-b border-slate-700">
                  <th className="sticky left-0 z-30 min-w-[24rem] border-r border-slate-700 bg-slate-900 px-3 py-2 font-black text-white">QS Description</th>
                  <th className="min-w-[6rem] px-3 py-2 font-black">Section</th>
                  <th className="min-w-[7rem] px-3 py-2 font-black">Instances</th>
                  <th className="min-w-[9rem] px-3 py-2 font-black">System Unit</th>
                  <th className="min-w-[9rem] px-3 py-2 font-black">BQ Unit</th>
                  <th className="min-w-[16rem] px-3 py-2 font-black">Suggested BQ</th>
                  <th className="min-w-[18rem] px-3 py-2 font-black">BQ Item Reference</th>
                  <th className="min-w-[14rem] px-3 py-2 font-black">BQ Description</th>
                  <th className="min-w-[10rem] px-3 py-2 font-black">Contract Rate</th>
                  <th className="min-w-[12rem] px-3 py-2 font-black">Status</th>
                  <th className="min-w-[12rem] px-3 py-2 font-black">Confirm</th>
                </tr>
              </thead>
              <tbody>
                {mappingRows.map((row) => {
                  const stagedMismatch = row.hasUnitMismatch;
                  const unitCellClass = stagedMismatch ? "bg-red-950/70 text-red-200 ring-1 ring-inset ring-red-500/50" : row.draftReference ? "bg-emerald-950/30 text-emerald-200" : "bg-slate-900 text-slate-300";
                  return (
                    <tr key={row.label} className={`border-b border-slate-700/40 align-top text-sm even:bg-slate-800/20 ${stagedMismatch ? "bg-red-950/25" : row.mappedReference ? "bg-slate-800/35" : "bg-slate-900/10"}`}>
                      <td className={`sticky left-0 z-10 min-w-[24rem] border-r border-slate-700/50 px-3 py-2 ${stagedMismatch ? "bg-red-950 text-red-100" : "bg-slate-900 text-slate-100"}`}>
                        <div className="font-semibold leading-6">{row.label}</div>
                        <div className="mt-1 text-xs text-slate-500">Live instances: {row.instanceCount}</div>
                      </td>
                      <td className="border-r border-slate-700/40 px-3 py-2 text-slate-300">{row.section}</td>
                      <td className="border-r border-slate-700/40 px-3 py-2 text-slate-300">{row.instanceCount}</td>
                      <td className="border-r border-slate-700/40 px-3 py-2"><div className="inline-flex min-w-[6rem] justify-center rounded-lg border border-blue-900/70 bg-blue-950/30 px-3 py-2 font-semibold text-blue-200">{row.systemUnit || "-"}</div></td>
                      <td className="border-r border-slate-700/40 px-3 py-2"><div className={`inline-flex min-w-[6rem] justify-center rounded-lg border px-3 py-2 font-semibold ${unitCellClass}`}>{row.selectedUnit || "-"}</div></td>
                      <td className="border-r border-slate-700/40 px-3 py-2">
                        {row.suggestedItem ? (
                          <div className="space-y-2">
                            <div className={`${row.suggestedSelectableItem ? "text-emerald-300" : "text-amber-300"} font-semibold`}>{row.suggestedItem.itemReference} ({row.suggestedItem.score})</div>
                            <div className="text-xs text-slate-500">{row.suggestedItem.description}</div>
                            <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${row.suggestedSelectableItem ? "border-slate-600 bg-transparent text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200" : "border-red-800 bg-transparent text-red-300"}`} onClick={() => row.suggestedSelectableItem ? onUpdateMapping(row.label, row.suggestedSelectableItem.itemReference) : undefined}>{row.suggestedSelectableItem ? "Approve Suggestion" : "Suggestion Blocked"}</button>
                          </div>
                        ) : <span className="text-slate-500">No recommendation</span>}
                      </td>
                      <td className="border-r border-slate-700/40 px-3 py-2"><select className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold text-white outline-none transition ${stagedMismatch ? "border-red-500 bg-red-950/50 focus:border-red-400" : "border-slate-700 bg-slate-900 focus:border-blue-500"}`} value={row.draftReference} onChange={(event) => onStageDraft(row.label, event.target.value)}><option value="">Unmapped</option>{row.selectableItems.map((item) => <option key={item.itemReference} value={item.itemReference}>{item.itemReference}{item.mismatch ? ` [Unit mismatch: ${item.unit} vs ${row.systemUnit || "-"}]` : ""}</option>)}</select></td>
                      <td className="border-r border-slate-700/40 px-3 py-2 text-slate-300">{row.draftItem?.description ?? row.mappedItem?.description ?? "-"}</td>
                      <td className="border-r border-slate-700/40 px-3 py-2 text-slate-100">{row.draftItem ? formatCurrencyValue(row.draftItem.contractRate) : row.mappedItem ? formatCurrencyValue(row.mappedItem.contractRate) : "-"}</td>
                      <td className="border-r border-slate-700/40 px-3 py-2"><div className={`inline-flex rounded-lg border px-3 py-2 text-xs font-bold ${stagedMismatch ? "border-red-700 bg-red-950/60 text-red-200" : row.unitStatus === "Mounted" ? "border-emerald-700 bg-emerald-950/30 text-emerald-200" : row.unitStatus === "Ready to confirm" ? "border-amber-700 bg-amber-950/30 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{row.unitStatus}</div></td>
                      <td className="px-3 py-2"><div className="flex flex-col gap-2"><button type="button" className={`rounded-lg px-3 py-2 text-sm font-black transition ${stagedMismatch ? "cursor-not-allowed bg-slate-700 text-slate-300" : "bg-blue-600 text-white hover:bg-blue-500"}`} onClick={() => onUpdateMapping(row.label, row.draftReference)} disabled={!row.draftReference || stagedMismatch}>{stagedMismatch ? "Blocked" : "Confirm Mount"}</button>{stagedMismatch && <div className="text-xs font-semibold text-red-300">Unit mismatch. Verify BQ unit.</div>}<button type="button" className="rounded-lg border border-slate-700 bg-transparent px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800" onClick={() => onUpdateMapping(row.label, "")}>Clear</button></div></td>
                    </tr>
                  );
                })}
                {mappingRows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">Run the comparison first. Only commercial Omission / Addition items are allowed into this BQ mounting console.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 更新 App.tsx — 替换 valuation tab JSX 为组件调用**

```tsx
import BQMappingPanel from './components/BQMappingPanel';

// 替换 showValuationTab 条件块的全部 JSX 为：
<BQMappingPanel
  mappingRows={mappingRows}
  bqFileName={bqFileName}
  bqItems={bqItems}
  bqError={bqError}
  mappingError={mappingError}
  orphanRows={orphanRows}
  orphanInstanceCount={orphanInstanceCount}
  orphanPreview={orphanPreview}
  mappedLabelCount={mappedLabelCount}
  mappingCandidatesCount={mappingCandidates.length}
  totalPendingRates={totalPendingRates}
  contractBqCount={contractBqCount}
  compareMessage={compareMessage}
  onUpdateMapping={updateLabelMapping}
  onStageDraft={stageDraftMapping}
/>
```

- [ ] **Step 3: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 4: Commit**

```bash
git add src/components/BQMappingPanel.tsx src/App.tsx
git commit -m "refactor: extract BQMappingPanel component from App.tsx"
```

---

### Task 8: 全局配色替换 — App.tsx 剩余 + index.css

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: 替换 App.tsx 中剩余的 zinc / sky / fuchsia 类名**

在 App.tsx 中做以下批量替换（只替换 Tailwind class 中的颜色，不改变量名或注释）：

| 查找 | 替换为 |
|---|---|
| `zinc-950` | `slate-900` |
| `zinc-900` | `slate-800` |
| `zinc-800` | `slate-700` |
| `zinc-700` | `slate-600` |
| `zinc-600` | `slate-500` |
| `zinc-500` | `slate-500` |
| `zinc-400` | `slate-400` |
| `zinc-300` | `slate-300` |
| `zinc-200` | `slate-200` |
| `zinc-100` | `slate-100` |
| `white/10` | `slate-700` |
| `white/5` | `slate-700/50` |
| `sky-500` | `blue-600` |
| `sky-400` | `blue-400` |
| `sky-300` | `blue-400` |
| `sky-200` | `blue-200` |
| `sky-950` | `blue-950` |
| `sky-900` | `blue-900` |
| `fuchsia-500` | `blue-600` |
| `fuchsia-400` | `blue-400` |
| `fuchsia-300` | `blue-400` |
| `fuchsia-200` | `blue-200` |

注意：只替换 Tailwind class name 里的值，不要替换 `border-white/8`（LoginPage 用的）或其他非 Tailwind 上下文。

同时替换 paywall modal、billing notices 等底部 JSX（行 1495-1538）中的相同颜色。

- [ ] **Step 2: 更新 `src/index.css` — base layer zinc→slate**

```css
@layer base {
  body {
    @apply bg-slate-900 text-slate-100 antialiased font-sans;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }
}
```

同时更新 scrollbar thumb 颜色：

```css
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #334155; /* slate-700 */
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #475569; /* slate-600 */
  }
```

和 glass-panel：

```css
  .glass-panel {
    @apply bg-slate-900/80 backdrop-blur-md border border-slate-700/50;
  }
```

- [ ] **Step 3: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "style: global color migration zinc→slate, sky/fuchsia→blue"
```

---

### Task 9: CopilotPanel.tsx 配色更新

**Files:**
- Modify: `src/components/CopilotPanel.tsx`

- [ ] **Step 1: 批量替换 CopilotPanel.tsx 中的颜色**

同 Task 8 的替换表，在 CopilotPanel.tsx 中执行：
- `zinc-*` → `slate-*`（按 Task 8 的映射）
- `sky-600/90` → `blue-600`（用户消息气泡）
- `sky-500` → `blue-600`（发送按钮、focus border）
- `sky-400` → `blue-400`（脉冲动画点）
- `sky-300` → `blue-400`（标题文字）
- `sky-500/40` → `blue-600/40`（prompt hover）
- `sky-500/10` → `blue-600/10`（prompt hover bg）
- `amber-500/20` → `slate-800`（工具调用背景）
- `amber-200` → `slate-400`（工具调用文字）
- `amber-500/5` → `slate-800/80`（工具调用背景）
- 保留 `amber-100`（工具调用 pre 文字，用于区分）
- `fuchsia-*` 相关替换同 Task 8

- [ ] **Step 2: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 3: Commit**

```bash
git add src/components/CopilotPanel.tsx
git commit -m "style: update CopilotPanel colors to QS blue theme"
```

---

### Task 10: LoginPage.tsx 配色更新

**Files:**
- Modify: `src/pages/LoginPage.tsx`

- [ ] **Step 1: 批量替换 LoginPage.tsx 中的颜色**

| 查找 | 替换为 |
|---|---|
| `#09090b` (gradient) | `#0f172a` (slate-900) |
| `rgba(14,165,233,` (sky gradient) | `rgba(37,99,235,` (blue-600) |
| `sky-500/20` | `blue-600/20` |
| `sky-500/10` | `blue-600/10` |
| `sky-300` | `blue-400` |
| `sky-500` (按钮 bg) | `blue-600` |
| `sky-400` (按钮 hover) | `blue-500` |
| `sky-500/60` (focus border) | `blue-500/60` |
| `sky-500/20` (focus ring) | `blue-500/20` |
| `zinc-950` | `slate-900` |
| `zinc-900` | `slate-800` |
| `zinc-500` | `slate-500` |
| `zinc-400` | `slate-400` |
| `zinc-200` | `slate-200` |
| `white/8` | `slate-700/50` |

- [ ] **Step 2: 运行 lint + build 验证**

Run: `npm run lint && npm run build`
Expected: 0 errors, build success

- [ ] **Step 3: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "style: update LoginPage colors to QS blue theme"
```

---

### Task 11: 端到端验证

**Files:** None (testing only)

- [ ] **Step 1: 启动 dev server**

Run: `npm run dev`
Expected: Vite dev server starts without errors

- [ ] **Step 2: 浏览器验证清单**

打开 localhost 进行以下手动测试：

1. 登录页显示正确，蓝色主题
2. 登录后看到 slate 底色的 header + sidebar
3. Upload Base IFC (`D:\IFC\07_building_arch.ifc`) → sidebar 状态灯变绿
4. Upload Revision IFC → sidebar 状态灯变绿
5. Run VO Comparison → KPI 卡片显示（6 个核心），点"展开更多指标"显示另外 8 个
6. 表格显示正确，行颜色对（omission 红、addition 绿）
7. 点击表格行 → 3D 视图聚焦对应元素
8. 切换到 Copilot tab → 发消息测试 → Agent 回复正常
9. 切换到 BQ Mapping tab → 映射交互正常
10. Export VO Excel → 下载成功
11. Sign Out → 返回登录页

- [ ] **Step 3: 确认无回归后，创建总结 commit**

```bash
git add -A
git commit -m "feat: UI visual polish — QS blue theme + component extraction

- Extracted 7 components from 1400-line App.tsx
- Global color migration: zinc→slate, sky/fuchsia→blue
- KPI grid: 14 cards → 6 primary + 8 collapsible
- All business logic unchanged, zero regression"
```
