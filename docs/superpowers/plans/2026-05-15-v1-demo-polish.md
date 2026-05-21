# V1 Demo Polish — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-05-15-v1-demo-polish-design.md`

---

### Task 1: 扩展 ActiveTab 类型 + App.tsx audit state

**Files:**
- Modify: `src/lib/format.ts` — add `'audit'` to ActiveTab union
- Modify: `src/App.tsx` — add audit state variables, runAudit callback, pass to sidebar

**Details:**
1. In `format.ts`, change `ActiveTab = 'overview' | 'valuation' | 'copilot'` to include `| 'audit'`
2. In `App.tsx`, add state: `auditResult`, `auditState`, `auditError`, `auditDurationMs`, `auditSlot`
3. Add `runAudit` callback that: sets state to running, calls `import('./audit/extractor').then(m => m.runAudit(...))`, measures duration with `performance.now()`, sets result/error, switches to audit tab
4. Pass `onRunAudit` and `auditState` to AppSidebar
5. Render `<AuditPanel>` in the main content area when `activeTab === 'audit'`
6. Run `tsc --noEmit` to verify

---

### Task 2: 创建 AuditPanel.tsx

**Files:**
- Create: `src/components/AuditPanel.tsx`

**Details:**
Create the audit report panel component with:

1. **Props interface:**
```typescript
interface AuditPanelProps {
  auditResult: AuditResult | null;
  auditState: 'idle' | 'running' | 'done' | 'error';
  auditError: string;
  auditDurationMs: number;
  auditSlot: 'base' | 'revision';
  onRunAudit: () => void;
  canRun: boolean; // at least one IFC loaded
}
```

2. **Idle state:** Show prompt to upload IFC and run audit

3. **Running state:** Show Loader2 spinner + real-time elapsed timer (useEffect interval counting up)

4. **Done state:**
- Header bar: "⚡ 算量报告 · Quantity Takeoff Report" + "{recordCount} 构件 · 算量完成 · 耗时 {duration}s"
- 5 KPI cards in a grid: recordCount, jkrCodeCount, quantityModeUsed, duration, Qto coverage %
- Main table: bqRows[] with columns: JKR Code, Description, Unit, Net Qty (4dp), Element Count
- Collapsible: classifications[] table
- Collapsible: quantitySources[] table

5. **Error state:** Show error message with retry button

6. Style: Match existing slate/blue theme. Use same KPICard pattern from KPIGrid.tsx.

---

### Task 3: 更新 AppSidebar — 添加 audit 按钮和 tab

**Files:**
- Modify: `src/components/AppSidebar.tsx`

**Details:**
1. Add props: `onRunAudit: () => void`, `auditState: string`
2. In Quick Actions section, add "Run Audit" button after "Run VO Comparison":
   - Enabled when v1State === 'ready' OR v2State === 'ready'
   - Shows spinner when auditState === 'running'
   - Label: "Run Audit" / subtitle: "快速算量"
3. In Views section, add "Audit Report" tab button (with BarChart3 icon from lucide-react)
4. Run `tsc --noEmit` to verify

---

### Task 4: 文件大小校验

**Files:**
- Modify: `src/App.tsx`

**Details:**
1. Add `const MAX_IFC_SIZE = 50 * 1024 * 1024;` constant
2. In the IFC upload handler (where file is read), add size check before `arrayBuffer()`:
   ```typescript
   if (file.size > MAX_IFC_SIZE) {
     setV1Error(`文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，上限 50MB`);
     return;
   }
   ```
3. Same for v2 upload handler
4. Run `tsc --noEmit` to verify

---

### Task 5: 全局 Error Boundary

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/main.tsx` — wrap App with ErrorBoundary

**Details:**
1. Create class component ErrorBoundary with `componentDidCatch`:
   - Catches render errors
   - Shows a centered error card with message + "重新加载" button
   - Styled in slate/blue theme
2. In main.tsx, wrap `<App />` (or `<AuthGuard>`) with `<ErrorBoundary>`
3. Run `tsc --noEmit` to verify

---

### Task 6: Toast 通知系统

**Files:**
- Install: `react-hot-toast`
- Modify: `src/App.tsx` — add Toaster, replace inline notices with toast calls

**Details:**
1. `npm install react-hot-toast --legacy-peer-deps`
2. Add `<Toaster position="top-right" />` in App return JSX
3. Add toast calls:
   - IFC load success: `toast.success(\`Base IFC 加载完成 · \${components.length} 构件\`)`
   - IFC load error: `toast.error(message)`
   - VO comparison done: `toast.success('VO 对比完成')`
   - Audit done: `toast.success(\`算量完成 · \${result.records.length} 构件 · \${(duration/1000).toFixed(1)}s\`)`
   - Export success: `toast.success('Excel 已导出')`
   - Export/billing errors: `toast.error(message)`
4. Style toaster to match dark theme: `toastOptions={{ style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' } }}`
5. Run `tsc --noEmit` to verify

---

### Task 7: Export 超时保护

**Files:**
- Modify: `src/App.tsx` — add timeout to credit polling in exportWorkbook

**Details:**
1. In the export function's credit polling loop, add a 30s max timeout:
   ```typescript
   const EXPORT_TIMEOUT = 30_000;
   const exportStart = Date.now();
   // inside polling loop:
   if (Date.now() - exportStart > EXPORT_TIMEOUT) {
     throw new Error('Credit check timed out after 30s. Please try again.');
   }
   ```
2. Add toast.error for timeout
3. Run `tsc --noEmit` + `npm test` to verify
