# VO System Agent 部署指南

## 前提条件
- [x] Supabase 项目已创建并运行
- [x] `NVIDIA_API_KEY` 已设置到 Supabase Secrets
- [x] v2-schema.sql (projects, project_files, vo_comparisons) 已执行
- [x] 知识库 seed 数据 (contract_clauses, ubbl_provisions, etc.) 已执行

---

## Step 1: 启用 pgvector 扩展

Supabase Dashboard → Database → Extensions → 搜索 **vector** → 点击 Enable

## Step 2: 执行数据库 Migration

打开 Supabase Dashboard → SQL Editor → 粘贴并运行：

```
supabase/sql/v2-agent-all-migrations.sql
```

这是一个合并文件，包含全部 13 张新表。运行完成后应看到：
```
status: "All agent migrations applied successfully"
seed_rates: 16
tables_created: 13
```

## Step 3: 部署 Edge Functions

在项目根目录执行：

```bash
# BQ 向量嵌入生成
supabase functions deploy embed-bq --no-verify-jwt

# Webhook 事件分发
supabase functions deploy dispatch-webhook --no-verify-jwt

# 公开 REST API
supabase functions deploy public-api --no-verify-jwt
```

注意：`--no-verify-jwt` 是因为这些函数自行验证 auth（通过 header）。

## Step 4: 前端部署

```bash
npm run build
# 部署到你的托管平台 (Vercel / Netlify / Cloudflare Pages)
```

## Step 5: 验证检查清单

### 数据库
- [ ] `SELECT count(*) FROM unit_rates;` → 应返回 16
- [ ] `SELECT count(*) FROM information_schema.tables WHERE table_name = 'bq_embeddings';` → 1
- [ ] `SELECT * FROM pg_extension WHERE extname = 'vector';` → 有结果

### Edge Functions
- [ ] 在 Supabase Dashboard → Edge Functions 确认 3 个新函数状态为 Active
- [ ] `embed-bq` / `dispatch-webhook` / `public-api`

### 前端功能
- [ ] 打开 Copilot → 看到角色选择按钮 (UserCog icon)
- [ ] 上传 Base IFC → 看到主动建议卡片 "Upload Revision Model"
- [ ] 上传两个 IFC → 看到 "Run VO Comparison" 高优先级建议
- [ ] 切换角色 → 角色按钮变绿，显示角色名
- [ ] Settings 页面 → 看到 Webhooks 和 API Keys 区域

---

## 后续数据补充

### 单价数据 (unit_rates)
当前只有 16 条基础种子数据。建议补充到 200+ 条，覆盖：
- 铝窗/门窗 (windows/doors)
- 电气 (electrical)
- 管道 (plumbing/mechanical)
- 防水 (waterproofing)
- 天花板 (ceiling)
- 地砖 (tiling/flooring)
- 外墙 (cladding/facade)

### 训练数据 (training_samples)
系统会在用户使用过程中自动收集。达到 500+ 条已验证样本后可考虑 fine-tune。
