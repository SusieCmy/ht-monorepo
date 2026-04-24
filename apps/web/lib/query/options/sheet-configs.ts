/**
 * sheet-config 业务域：表格配置的 queryOptions 工厂 + 领域类型。
 *
 * 契约来自 iaxixi Apifox 项目 (`/sheet-config`, `/sheet-config/{id}`)，
 * 但由于当前 OAS 的 schema 为空，字段以数据库 `sheet_config` 表为准：
 *   - id          主键（数字）
 *   - name        表格名称
 *   - columns     列定义数组（JSON）—— `[{id, name, type, order}]`
 *   - created_at  / updated_at
 *
 * 如果后端实际返回字段名不同（例如用下划线而非驼峰），只需要在下面的
 * queryFn 里做一次字段名映射即可，UI 层不需要改动。
 */

import { queryOptions } from "@tanstack/react-query"

import { queryKeys } from "../keys"
import { apiRequest } from "../request"

/** 列允许的数据类型。`dict` 表示该列值来自某个字典类型下的可选项。 */
export type SheetColumnType = "text" | "number" | "date" | "dict"

/** 单列定义：一张表有若干列，每列一个独立 id，前端按 order 升序渲染。 */
export interface SheetColumn {
  /** 列 id，例如 `col_1`；行数据的 values 用它当 key。 */
  id: string
  /** 列在表头上显示的名字，可被用户编辑。 */
  name: string
  /** 列的数据类型，影响 AG Grid 的编辑器与展示格式。 */
  type: SheetColumnType
  /** 1 开始的排序索引。 */
  order: number
  /**
   * 仅当 `type === 'dict'` 时使用：关联的字典类型 code（dict_type.code），
   * 例如 `product_type`。前端据此拉下拉项列表。
   */
  dictTypeCode?: string
}

/** 表格配置：对应 `sheet_config` 表一行，UI 用它渲染出整张表的列头。 */
export interface SheetConfig {
  id: number
  name: string
  columns: SheetColumn[]
  createdAt?: string
  updatedAt?: string
}

/**
 * 部分后端可能直接回原始表字段（snake_case）或把 columns 存成 JSON 字符串。
 * 统一用一个 normalizer 吃下去，上层无感。
 */
function normalizeSheetConfig(raw: unknown): SheetConfig {
  const r = raw as Record<string, unknown>
  const rawColumns = r.columns
  let columns: SheetColumn[] = []
  if (Array.isArray(rawColumns)) {
    columns = rawColumns as SheetColumn[]
  } else if (typeof rawColumns === "string") {
    try {
      const parsed = JSON.parse(rawColumns)
      if (Array.isArray(parsed)) columns = parsed as SheetColumn[]
    } catch {
      columns = []
    }
  }
  // 一律按 order 升序（即便后端返回的是乱序，也保持前端渲染稳定）
  columns = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    columns,
    createdAt: (r.createdAt ?? r.created_at) as string | undefined,
    updatedAt: (r.updatedAt ?? r.updated_at) as string | undefined,
  }
}

export function sheetConfigListOptions() {
  return queryOptions({
    queryKey: queryKeys.sheetConfigs.lists(),
    queryFn: async ({ signal }) => {
      const raw = await apiRequest<unknown[]>("/sheet-config", { signal })
      return Array.isArray(raw) ? raw.map(normalizeSheetConfig) : []
    },
    staleTime: 60 * 1000,
  })
}

export function sheetConfigDetailOptions(id: number) {
  return queryOptions({
    queryKey: queryKeys.sheetConfigs.detail(id),
    queryFn: async ({ signal }) => {
      const raw = await apiRequest<unknown>(`/sheet-config/${id}`, { signal })
      return normalizeSheetConfig(raw)
    },
    // 表格配置不是高频变动数据，配置拿到后 5 分钟内都算新鲜。
    staleTime: 5 * 60 * 1000,
    enabled: Number.isFinite(id) && id > 0,
  })
}
