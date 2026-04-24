"use client"

import { useMemo } from "react"

import { useQuery } from "@tanstack/react-query"

import { options } from "@/lib/query"
import type { SheetRowFilters } from "@/lib/query/options/sheet-rows"

import { SheetGridClient } from "@/features/sheets/components/sheet-grid-client"

/**
 * 预警页的 Client Wrapper：
 *  1. 从 sheet-config 找出"库存列"对应的 colId（按名字候选列表匹配）；
 *  2. 把 `{ [stockColId]: { lt: threshold } }` 作为 forcedFilters 交给
 *     SheetGrid，后端会在 MariaDB 侧 `CAST(... AS DECIMAL) < 10` 过滤；
 *  3. 以只读 + 仅删除按钮的方式展示命中行。
 *
 * 注意：此组件只负责"翻译 + 注入"，不重复实现表格。所有渲染逻辑复用
 * SheetGrid（列类型、字典、分页…），保证预警页和入库页视觉完全一致。
 */
export interface AlertSheetClientProps {
  sheetId: number
  stockColumnCandidates: readonly string[]
  stockThreshold: number
}

export function AlertSheetClient({
  sheetId,
  stockColumnCandidates,
  stockThreshold,
}: AlertSheetClientProps) {
  const configQuery = useQuery(
    options.sheetConfigs.sheetConfigDetailOptions(sheetId),
  )

  // 解析"库存列"id：按候选名列表顺序匹配第一个命中的列。
  // 匹配以 name.trim() 为准，比较时同时尝试大小写归一化，免得"库存 "
  // 这种多空格或 "KuCun" 这种英文别名漏掉。
  const stockColId = useMemo(() => {
    const columns = configQuery.data?.columns ?? []
    if (columns.length === 0) return null
    for (const candidate of stockColumnCandidates) {
      const norm = candidate.trim().toLowerCase()
      const hit = columns.find((c) => c.name?.trim().toLowerCase() === norm)
      if (hit) return hit.id
    }
    return null
  }, [configQuery.data?.columns, stockColumnCandidates])

  const forcedFilters = useMemo<SheetRowFilters | undefined>(() => {
    if (!stockColId) return undefined
    // 用字符串是因为 SheetRowFilterValue 的字段类型是 string（走表单直传）；
    // 后端 service 的 toNumberOrUndefined 会把它转回 number 再做 CAST。
    return { [stockColId]: { lt: String(stockThreshold) } }
  }, [stockColId, stockThreshold])

  if (configQuery.isPending) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
        正在加载入库表配置…
      </div>
    )
  }

  if (configQuery.isError) {
    return (
      <div className="text-destructive flex h-40 items-center justify-center text-sm">
        入库表配置加载失败：{configQuery.error.message}
      </div>
    )
  }

  if (!stockColId) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 p-8 text-sm">
        <p>没有在入库表里找到"库存 / 数量"列。</p>
        <p className="text-xs">
          请到入库管理页添加或将某一数值列重命名为 {" "}
          <span className="font-mono">
            {stockColumnCandidates.join(" / ")}
          </span>
          ，保存后回到本页即可。
        </p>
      </div>
    )
  }

  return (
    <SheetGridClient
      sheetId={sheetId}
      readOnly
      hidePrintRowAction
      hideFilterPanel
      forcedFilters={forcedFilters}
      printLabelTitle="库存预警"
    />
  )
}
