/**
 * 字典业务域：字典类型（dict_type）+ 字典项（dict_item）的 queryOptions 工厂。
 *
 * 后端契约：
 *   GET /dict-type                         -> DictType[]
 *   GET /dict-item?typeCode=product_type   -> DictItem[]
 *
 * 字典类型在 sheet_config 里被"类型为 dict 的列"通过 `dictTypeCode` 引用，
 * 前端渲染下拉编辑器时再按 typeCode 拉该类型下的所有 items。
 */

import { queryOptions } from "@tanstack/react-query"

import { queryKeys } from "../keys"
import { apiRequest } from "../request"

export interface DictType {
  id: number
  code: string
  name: string
  description?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface DictItem {
  id: number
  typeCode: string
  value: string
  label: string
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

/** 后端字段可能是 snake_case（type_code / sort_order），统一归一化。 */
function normalizeDictType(raw: unknown): DictType {
  const r = raw as Record<string, unknown>
  return {
    id: Number(r.id),
    code: String(r.code ?? ""),
    name: String(r.name ?? ""),
    description: (r.description ?? null) as string | null,
    createdAt: (r.createdAt ?? r.created_at) as string | undefined,
    updatedAt: (r.updatedAt ?? r.updated_at) as string | undefined,
  }
}

function normalizeDictItem(raw: unknown): DictItem {
  const r = raw as Record<string, unknown>
  return {
    id: Number(r.id),
    typeCode: String(r.typeCode ?? r.type_code ?? ""),
    value: String(r.value ?? ""),
    label: String(r.label ?? ""),
    sortOrder: Number(r.sortOrder ?? r.sort_order ?? 0),
    createdAt: (r.createdAt ?? r.created_at) as string | undefined,
    updatedAt: (r.updatedAt ?? r.updated_at) as string | undefined,
  }
}

/** 所有字典类型 —— 给"添加列 dialog"的下拉用。 */
export function dictTypeListOptions() {
  return queryOptions({
    queryKey: queryKeys.dictTypes.lists(),
    queryFn: async ({ signal }) => {
      const raw = await apiRequest<unknown[]>("/dict-type", { signal })
      return Array.isArray(raw) ? raw.map(normalizeDictType) : []
    },
    // 字典类型不会高频变动，10 分钟内都算新鲜。
    staleTime: 10 * 60 * 1000,
  })
}

interface DictItemListParams {
  typeCode: string
}

/**
 * 某字典类型下的所有 items —— 给 dict 列的单元格 select 编辑器用。
 * key 里包含 typeCode，不同类型互不污染。
 */
export function dictItemListOptions({ typeCode }: DictItemListParams) {
  return queryOptions({
    queryKey: queryKeys.dictItems.list({ typeCode }),
    queryFn: async ({ signal }) => {
      const raw = await apiRequest<unknown[]>(
        `/dict-item?typeCode=${encodeURIComponent(typeCode)}`,
        { signal },
      )
      return Array.isArray(raw) ? raw.map(normalizeDictItem) : []
    },
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(typeCode),
  })
}
