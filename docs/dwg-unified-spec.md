# 统一版设计 Spec — IFC + DWG Copilot

> 日期:2026-05-31
> 分支:`feature/dwg-takeoff`(不动 main)
> 目标:在 V1(IFC VO Copilot)基础上,加入 DWG 算量,统一管线。
> DWG 主业:算量 / BQ / 报价。VO 对比仍为 IFC 专属。

---

## 1. 核心架构:统一工程量模型

两个入口,一个公共数据模型,共享下游。

```
输入 (.ifc / .dwg)
   ├─ IFC 入口  (web-ifc WASM，现有)      ─┐
   └─ DWG 入口  (libredwg-web WASM，新)    ─┴─→ QuantityItem[] ─→ 共享下游

共享下游:审计报告 · BQ 映射 · Excel 导出 · Copilot
仅 IFC:3D 查看器 · VO 对比
仅 DWG:2D 图纸查看器
```

上传时按扩展名自动识别格式并路由,两边都产出 `QuantityItem`,下游不关心来源。

---

## 2. 公共数据模型 `QuantityItem`

```ts
interface QuantityItem {
  source: 'ifc' | 'dwg';
  category: string;          // 柱 / 门 / 墙 / 洁具 ...
  measureKind: 'count' | 'length' | 'area' | 'volume';
  quantity: number;
  unit: string;              // nr / m / m² / m³
  description?: string;      // 供 BQ 匹配
  confidence: 'high' | 'review';
  needsReview: boolean;      // DWG 低置信度(墙/窗)= true
  // 注:不带 2D 坐标 / 3D 几何。引擎内部算用坐标,算完只吐数字。
}
```

- IFC 构件:measureKind 多为 volume/area,confidence 恒 high。
- DWG 构件:count/length/area,墙/窗等标 needsReview。
- **无 2D/3D 几何进下游** —— 纯数字,数据模型干净。

---

## 3. 查看器(各走本性)

| 来源 | 查看器 | 说明 |
|------|--------|------|
| IFC | 3D(Three.js,现有) | 真 3D + VO 高亮 |
| DWG | 2D 标注图(引擎生成 PNG) | 原生 2D,**不做 2.5D 拉伸**(高度是猜的,不准) |

决策:**准确第一,DWG 老实 2D。** 不为演示做假 3D。

---

## 4. UI 变更(V1 基础上)

**上传区**:文件框同时接受 `.ifc` / `.dwg`,自动识别。

**侧边栏 Views**:
```
IFC Copilot
审计报告           ← IFC + DWG 都能出
3D 模型 & 差异      ← 仅 IFC(3D + VO)
2D 图纸 & 算量      ← 新增,DWG 专属
BQ 映射 & 定价      ← IFC + DWG 共用
使用指南
```

**下游面板认数据不认来源**:审计 / BQ / Excel 把 IFC 和 DWG 的项混排,多两列:`来源` + `置信度`。

**Review 面板**(新):DWG 的 needsReview 项单列,QS 点"确认 / 否决"。

---

## 5. 复用 vs 新建

| 模块 | 处理 |
|------|------|
| 认证 / 积分 / Stripe | ✅ 完全复用 |
| BQ 映射 / Excel 导出 | ✅ 复用(改成吃 QuantityItem) |
| Copilot | ✅ 复用 + 加 DWG 工具 |
| i18n / UI 外壳 | ✅ 复用 |
| DWG 入口(engine/doors/fixtures/autoscan/views/length/walls/area) | 🆕 从 dwg-mvp 搬入 |
| QuantityItem 适配层(IFC→QI、DWG→QI) | 🆕 新建 |
| 2D 图纸查看器 | 🆕 新建 |
| Review 面板 | 🆕 新建 |

---

## 6. 分期

| 期 | 内容 | 产出 |
|----|------|------|
| **P1** | DWG 入口 + QuantityItem + 2D 查看器 + 审计报告 | 上传 DWG 出数量报告 |
| **P2** | DWG 接 BQ 映射 + Excel 导出 | DWG 出 BQ / 报价(赚钱功能) |
| **P3** | Copilot 读 DWG + Review 面板 | AI 读图 + 人工复核闭环 |

---

## 7. DWG 引擎当前能力(来自 dwg-mvp,待搬入)

**数量类(高准)**:柱(圆,交叉验证)、门(弧)、洁具(椭圆)、雨水管(圆)、桁架(平行线)。
**面积类**:闭合多边形 + 柱网凸包(双重验证)。
**长度类**:管线完整(视图隔离 + 双线配对),需房间型建筑验证。
**视图隔离**:平面/剖面/立面自动分。
**自动发现**:autoscan 扫任意图列出可数构件 + 置信度。

---

## 8. 约束 / 风险

- **不动 GitHub main**,全部在 `feature/dwg-takeoff`。
- DWG 引擎只在 1 张礼堂图验证,搬入前/后需多样本测。
- 长度/面积类标 needsReview,默认走人工复核,不当全自动卖。
- DWG VO 对比不在本期范围(2D 无持久 ID,技术上最难)。

---

## 9. 产品 / 商业定位

- V1 保留 IFC(政府强制趋势),加 DWG(当下 SME 现金流)。两条腿。
- 数量类全自动 + 长度面积人工复核,边际成本≈0,打 Kreo/Togal 够不着的价格敏感 SME。
