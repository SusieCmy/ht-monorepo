/**
 * sheet-row-index 业务域：动态表格行数据的 queryOptions 工厂。
 *
 * 契约来自 iaxixi Apifox 项目的 `/sheet-row-index` 路由：
 *   - GET    /sheet-row-index?sheetId=1   获取某张表的所有行
 *   - POST   /sheet-row-index              新增一行
 *   - PATCH  /sheet-row-index/{id}         更新一行
 *   - DELETE /sheet-row-index/{id}         删除一行
 *
 * 前端行契约（SheetRow）是聚合形态：一行 = 多列值的集合。数据库 `sheet_row_index`
 * 表本身是 EAV (entity-attribute-value)，后端若直接返回原始 EAV 记录，需要在
 * normalizeSheetRows 里按 row_id 分组聚合一次；如果后端已聚合好，normalize
 * 函数直接透传即可。
 */

import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import type { SerializableObject } from "../keys"
import { queryKeys } from "../keys"
import { apiRequest } from "../request"

/** 一行数据，values 的 key 对应 SheetColumn.id（如 `col_1`）。 */
export interface SheetRow {
  id: number
  sheetId: number
  values: Record<string, string>
  createdAt?: string
  updatedAt?: string
}

/**
 * 单列筛选条件，和后端 `SheetRowColumnFilter` 对齐。字段均可选，
 * service 层按"哪些字段有值"决定走哪个 SQL 片段：
 *  - text:   `contains`
 *  - number: `min` / `max`（闭区间） / `lt` / `gt`（严格开区间）
 *  - date:   `from` / `to`
 *  - dict:   `value`（严格相等）
 *
 * 注：字段值都是字符串（表单直接传入），后端负责 CAST / 解析。
 * lt/gt 主要给"预警"这种内置固定条件用（库存 < 10），用户筛选面板
 * 目前只暴露 min/max 闭区间。
 */
export interface SheetRowFilterValue extends SerializableObject {
  contains?: string
  min?: string
  max?: string
  lt?: string
  gt?: string
  from?: string
  to?: string
  value?: string
}

export type SheetRowFilters = Record<string, SheetRowFilterValue>

export interface SheetRowListParams {
  sheetId: number
  /**
   * 可选筛选条件。为空对象 / undefined 时走 GET（简单列表），
   * 有任意一条生效字段时走 POST `/sheet-row-index/query`。
   */
  filters?: SheetRowFilters
}

/**
 * 只保留"有值"的字段，返回一个新的、可放进 queryKey 的纯对象。
 * 空串 / undefined / 纯空格都视为未设置。这样 queryKey 才能稳定，
 * 比如 `{ col_1: { contains: "" } }` 会被归一化成 `{}`。
 */
function normalizeFilters(
  filters: SheetRowFilters | undefined,
): SheetRowFilters {
  if (!filters) return {}
  const out: SheetRowFilters = {}
  for (const [colId, raw] of Object.entries(filters)) {
    if (!raw) continue
    const entry: SheetRowFilterValue = {}
    if (typeof raw.contains === "string" && raw.contains.trim() !== "") {
      entry.contains = raw.contains
    }
    if (typeof raw.min === "string" && raw.min.trim() !== "") entry.min = raw.min
    if (typeof raw.max === "string" && raw.max.trim() !== "") entry.max = raw.max
    if (typeof raw.lt === "string" && raw.lt.trim() !== "") entry.lt = raw.lt
    if (typeof raw.gt === "string" && raw.gt.trim() !== "") entry.gt = raw.gt
    if (typeof raw.from === "string" && raw.from !== "") entry.from = raw.from
    if (typeof raw.to === "string" && raw.to !== "") entry.to = raw.to
    if (typeof raw.value === "string" && raw.value.trim() !== "") {
      entry.value = raw.value
    }
    if (Object.keys(entry).length > 0) out[colId] = entry
  }
  return out
}

function hasAnyFilter(filters: SheetRowFilters): boolean {
  return Object.keys(filters).length > 0
}

/**
 * 归一化后端返回：支持两种形态
 *  - 聚合形态：`[{ id, sheetId, values: { col_1: ..., col_2: ... } }]`
 *  - 原始 EAV：`[{ id, sheetId, rowId, columnId, value }]`（按 rowId 聚合）
 *
 * 两种都能吞，上层组件只关心 `SheetRow[]`。
 */
function normalizeSheetRows(raw: unknown): SheetRow[] {
  if (!Array.isArray(raw)) return []

  const first = raw[0] as Record<string, unknown> | undefined
  if (first && typeof first === "object" && "values" in first) {
    // 聚合形态：挨个包一下类型
    return raw.map((item) => {
      const r = item as Record<string, unknown>
      const values = (r.values ?? {}) as Record<string, unknown>
      return {
        id: Number(r.id),
        sheetId: Number(r.sheetId ?? r.sheet_id),
        values: Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, v == null ? "" : String(v)]),
        ),
        createdAt: (r.createdAt ?? r.created_at) as string | undefined,
        updatedAt: (r.updatedAt ?? r.updated_at) as string | undefined,
      }
    })
  }

  // 原始 EAV 形态：按 rowId 分组，每组聚合成一行。
  const grouped = new Map<number, SheetRow>()
  for (const item of raw) {
    const r = item as Record<string, unknown>
    const rowId = Number(r.rowId ?? r.row_id)
    const columnId = String(r.columnId ?? r.column_id ?? "")
    const value = r.value == null ? "" : String(r.value)
    const sheetId = Number(r.sheetId ?? r.sheet_id)
    if (!Number.isFinite(rowId) || !columnId) continue

    const existed = grouped.get(rowId)
    if (existed) {
      existed.values[columnId] = value
    } else {
      grouped.set(rowId, {
        id: rowId,
        sheetId,
        values: { [columnId]: value },
      })
    }
  }
  return Array.from(grouped.values())
}

export function sheetRowListOptions({ sheetId, filters }: SheetRowListParams) {
  const normalized = normalizeFilters(filters)
  const hasFilter = hasAnyFilter(normalized)

  return queryOptions({
    // queryKey 必须包含归一化后的 filters；依赖 qk-include-dependencies，
    // 否则切换筛选条件时 TanStack Query 会复用脏缓存。
    queryKey: queryKeys.sheetRows.list({ sheetId, filters: normalized }),
    queryFn: async ({ signal }) => {
      if (hasFilter) {
        // 有筛选条件时走 POST /query：filters 是嵌套对象，不适合塞进 URL，
        // 同时后端统一用 MariaDB JSON 函数做服务端过滤。
        const raw = await apiRequest<unknown[]>(`/sheet-row-index/query`, {
          method: "POST",
          body: { sheetId, filters: normalized },
          signal,
        })
        return normalizeSheetRows(raw)
      }
      // 无筛选：保持原先的轻量 GET，方便后端和 CDN 缓存。
      const raw = await apiRequest<unknown[]>(
        `/sheet-row-index?sheetId=${encodeURIComponent(sheetId)}`,
        { signal },
      )
      return normalizeSheetRows(raw)
    },
    // 行数据切换 sheetId / 筛选条件时用 keepPreviousData，避免空白闪烁。
    placeholderData: keepPreviousData,
    enabled: Number.isFinite(sheetId) && sheetId > 0,
  })
}
