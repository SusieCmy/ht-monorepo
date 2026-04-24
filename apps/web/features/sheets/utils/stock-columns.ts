/**
 * 入库 / 出库 / 预警共享的「关键列名」候选。
 *
 * 表头是用户自定义的，同一个语义可能起名不一致（库存 / 库存数量 / 数量 …），
 * 这里集中维护候选顺序，业务代码统一调用 `findColumnIdByCandidates` 定位。
 * 候选要加改这里改，别到处 copy。
 */

import type { SheetColumn } from "@/lib/query/options/sheet-configs"

/** 库存数量列候选名。按优先级从高到低。 */
export const STOCK_COLUMN_CANDIDATES = [
  "库存",
  "库存数量",
  "数量",
] as const

/** 商品名称列候选名。 */
export const PRODUCT_COLUMN_CANDIDATES = [
  "商品名称",
  "商品",
  "名称",
  "品名",
] as const

/**
 * 按候选名（忽略大小写 + trim）在列定义里找第一个命中的列，返回其 id。
 * 找不到返回 null，调用方自行决定如何兜底。
 */
export function findColumnIdByCandidates(
  columns: ReadonlyArray<Pick<SheetColumn, "id" | "name">>,
  candidates: readonly string[],
): string | null {
  for (const candidate of candidates) {
    const norm = candidate.trim().toLowerCase()
    const hit = columns.find((c) => c.name?.trim().toLowerCase() === norm)
    if (hit) return hit.id
  }
  return null
}

/**
 * 把库存单元格的字符串值解析成数字。空串 / 非法返回 null，
 * 便于调用方区分"未填"和"填了 0"。
 */
export function parseStockValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const s = typeof raw === "string" ? raw.trim() : String(raw)
  if (s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
