// DWG BoQ Excel export — turns unified QuantityItem[] + rates into a priced
// Bill of Quantities workbook. Reuses the xlsx lib already in V1.
import * as XLSX from 'xlsx';
import type { QuantityItem } from './quantityModel';

export interface RatedItem extends QuantityItem {
  rate?: number;      // unit rate (RM)
  amount?: number;    // quantity × rate
}

export function exportDwgBoq(items: RatedItem[], fileName: string) {
  const currency = 'RM';
  const header = ['No.', '构件 / Description', '来源', '单位', '数量', `单价 (${currency})`, `金额 (${currency})`, '置信度'];
  const rows = items.map((it, i) => {
    const amount = typeof it.rate === 'number' ? it.quantity * it.rate : '';
    return [i + 1, it.description || it.category, it.source.toUpperCase(), it.unit, it.quantity,
      typeof it.rate === 'number' ? it.rate : '', amount, it.needsReview ? '待复核 Review' : '高 High'];
  });

  const rated = items.filter((it) => typeof it.rate === 'number');
  const total = rated.reduce((s, it) => s + it.quantity * (it.rate as number), 0);

  const aoa: (string | number)[][] = [
    ['DWG 工程量清单 / Bill of Quantities', '', '', '', '', '', '', ''],
    [`图纸 / Drawing: ${fileName}`, '', '', '', '', '', '', ''],
    [`生成 / Generated: ${new Date().toLocaleString()}`, '', '', '', '', '', '', ''],
    [],
    header,
    ...rows,
    [],
    ['', '', '', '', '', '合计 / Total', total, ''],
    [],
    ['说明 / Notes:', '', '', '', '', '', '', ''],
    ['· 数量类(柱/门/雨水管)为引擎自动算量,高置信度。', '', '', '', '', '', '', ''],
    ['· 标"待复核"项(洁具类型/墙/面积)需 QS 确认后定价。', '', '', '', '', '', '', ''],
    ['· DWG 全本地解析,零上传。', '', '', '', '', '', '', ''],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'DWG BoQ');
  const base = fileName.replace(/\.[^.]+$/, '');
  XLSX.writeFile(wb, `${base}-DWG-BoQ.xlsx`);
}
