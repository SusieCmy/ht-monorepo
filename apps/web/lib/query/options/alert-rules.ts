/**
 * 预警业务域：按「表格 + 商品名」单独配置库存阈值。
 *
 * 后端契约：
 *   GET    /alert-rule?sheetId=1             -> AlertRule[]
 *   POST   /alert-rule/bulk-upsert           批量保存阈值
 *   DELETE /alert-rule/{sheetId}/{product}   按商品删除
 *   POST   /alert-rule/hits                  按规则查命中行
 *
 * 之所以不把命中查询塞进 /sheet-row-index/query：通用 query 是"单列
 * 单阈值"，预警场景是"每个商品各自阈值"，需要 OR 分支，独立 endpoint 更清晰。
 */

import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { queryKeys } from "../keys"
import { apiRequest } from "../request"

export interface AlertRule {
  id: number
  sheetId: number
  productName: string
  threshold: number
  createdAt?: string
  updatedAt?: string
}

/** 后端返回的命中行：在 SheetRow 基础上附加该行实际应用的阈值信息。 */
export interface AlertHitRow {
  id: number
  sheetId: number
  values: Record<string, string>
  /** 该行实际用于比较的阈值（商品规则优先，否则 defaultThreshold）。 */
  appliedThreshold: number
  productName: string
  stockValue: number | null
  createdAt?: string
  updatedAt?: string
}

function normalizeAlertRule(raw: unknown): AlertRule {
  const r = raw as Record<string, unknown>
  return {
    id: Number(r.id),
    sheetId: Number(r.sheetId ?? r.sheet_id),
    productName: String(r.productName ?? r.product_name ?? ""),
    threshold: Number(r.threshold ?? 0),
    createdAt: (r.createdAt ?? r.created_at) as string | undefined,
    updatedAt: (r.updatedAt ?? r.updated_at) as string | undefined,
  }
}

function normalizeAlertHit(raw: unknown): AlertHitRow {
  const r = raw as Record<string, unknown>
  const values = (r.values ?? {}) as Record<string, unknown>
  return {
    id: Number(r.id),
    sheetId: Number(r.sheetId ?? r.sheet_id),
    values: Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v == null ? "" : String(v)]),
    ),
    appliedThreshold: Number(r.appliedThreshold ?? r.applied_threshold ?? 0),
    productName: String(r.productName ?? r.product_name ?? ""),
    stockValue:
      r.stockValue === null || r.stockValue === undefined
        ? null
        : Number(r.stockValue),
    createdAt: (r.createdAt ?? r.created_at) as string | undefined,
    updatedAt: (r.updatedAt ?? r.updated_at) as string | undefined,
  }
}

interface AlertRuleListParams {
  sheetId: number
}

/** 某张表的所有预警规则，"预警设置"弹窗打开时用来回显已保存配置。 */
export function alertRuleListOptions({ sheetId }: AlertRuleListParams) {
  return queryOptions({
    queryKey: queryKeys.alertRules.list({ sheetId }),
    queryFn: async ({ signal }) => {
      const raw = await apiRequest<unknown[]>(
        `/alert-rule?sheetId=${encodeURIComponent(sheetId)}`,
        { signal },
      )
      return Array.isArray(raw) ? raw.map(normalizeAlertRule) : []
    },
    enabled: Number.isFinite(sheetId) && sheetId > 0,
  })
}

export interface AlertHitsParams {
  sheetId: number
  productColumnId: string
  stockColumnId: string
  /** 未配置规则的商品兜底阈值；不传 → 未配置商品不进预警列表。 */
  defaultThreshold?: number
}

/**
 * 命中行查询：把 sheetId / 列 id / 默认阈值一起作为 queryKey 的一部分，
 * 这样"列 id 变了" / "默认阈值变了"都会自然触发重新 fetch，不会读脏缓存。
 *
 * 注意 alert-rule 里的商品阈值变更不会让这个 key 发生变化 —— 由
 * mutation hook 在保存后 invalidate `alertHits.lists()` 强制刷新。
 */
export function alertHitsOptions({
  sheetId,
  productColumnId,
  stockColumnId,
  defaultThreshold,
}: AlertHitsParams) {
  return queryOptions({
    queryKey: queryKeys.alertHits.list({
      sheetId,
      productColumnId,
      stockColumnId,
      defaultThreshold: defaultThreshold ?? null,
    }),
    queryFn: async ({ signal }) => {
      const raw = await apiRequest<unknown[]>(`/alert-rule/hits`, {
        method: "POST",
        body: {
          sheetId,
          productColumnId,
          stockColumnId,
          ...(defaultThreshold !== undefined
            ? { defaultThreshold }
            : {}),
        },
        signal,
      })
      return Array.isArray(raw) ? raw.map(normalizeAlertHit) : []
    },
    placeholderData: keepPreviousData,
    enabled:
      Number.isFinite(sheetId) &&
      sheetId > 0 &&
      Boolean(productColumnId) &&
      Boolean(stockColumnId),
  })
}
