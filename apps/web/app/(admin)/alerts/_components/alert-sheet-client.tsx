"use client"

import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { IconSettings } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

import { options } from "@/lib/query"

import { SheetGridClient } from "@/features/sheets/components/sheet-grid-client"
import { AlertSettingsDialog } from "@/features/alerts/components/alert-settings-dialog"

/**
 * 预警页的 Client Wrapper：
 *  1. 从 sheet-config 里按候选名找出「库存列」和「商品列」；
 *  2. 用 `/alert-rule/hits` 按每商品阈值 + 默认阈值查命中行；
 *  3. 把命中结果作为 `rowsOverride` 塞进 SheetGrid，只读展示；
 *  4. 顶栏有「预警设置」按钮 → 打开 AlertSettingsDialog 管理阈值。
 *
 * 默认阈值是页面内存状态（当前会话生效），保存到后端规则后会持久化。
 * 未来要跨会话持久化默认阈值，可以把它放进一张 config 表或 localStorage。
 */
export interface AlertSheetClientProps {
  sheetId: number
  stockColumnCandidates: readonly string[]
  productColumnCandidates: readonly string[]
  initialStockThreshold: number
}

/** 候选名匹配：对每个候选名做 trim+toLowerCase，和列的 name 做比对。 */
function findColumnIdByNames(
  columns: Array<{ id: string; name: string }>,
  candidates: readonly string[],
): string | null {
  for (const candidate of candidates) {
    const norm = candidate.trim().toLowerCase()
    const hit = columns.find((c) => c.name?.trim().toLowerCase() === norm)
    if (hit) return hit.id
  }
  return null
}

export function AlertSheetClient({
  sheetId,
  stockColumnCandidates,
  productColumnCandidates,
  initialStockThreshold,
}: AlertSheetClientProps) {
  const configQuery = useQuery(
    options.sheetConfigs.sheetConfigDetailOptions(sheetId),
  )

  const columns = configQuery.data?.columns ?? []

  const stockColId = useMemo(
    () => findColumnIdByNames(columns, stockColumnCandidates),
    [columns, stockColumnCandidates],
  )
  const productColId = useMemo(
    () => findColumnIdByNames(columns, productColumnCandidates),
    [columns, productColumnCandidates],
  )

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [defaultThreshold, setDefaultThreshold] = useState(initialStockThreshold)

  // 命中行查询：productColId / stockColId 都就位才启用；
  // defaultThreshold 变化会让 queryKey 变 → 自动重查。
  const hitsQuery = useQuery(
    options.alertRules.alertHitsOptions({
      sheetId,
      productColumnId: productColId ?? "",
      stockColumnId: stockColId ?? "",
      defaultThreshold,
    }),
  )

  // AlertHitRow 结构上兼容 SheetRow（多了 appliedThreshold / stockValue 等
  // 纯展示字段），直接喂给 SheetGrid 也完全没问题。
  //
  // 重要：用 `?? []` 兜底成空数组而不是 undefined。SheetGrid 里用
  // `rowsOverride !== undefined` 判断"是否外接行数据"，如果这里是 undefined，
  // 加载首帧就会退回内置 sheetRowListOptions 把全表拉回来 —— 看起来像
  // "预警页显示了全部数据"，就是这个 bug。loading 状态单独通过
  // rowsOverrideLoading 传。
  const rowsOverride = hitsQuery.data ?? []

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

  if (!stockColId || !productColId) {
    const missing = [
      !stockColId && `库存列（候选：${stockColumnCandidates.join(" / ")}）`,
      !productColId &&
        `商品名称列（候选：${productColumnCandidates.join(" / ")}）`,
    ].filter(Boolean)
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 p-8 text-sm">
        <p>入库表里没找到以下列：</p>
        <p className="text-foreground text-xs">{missing.join("；")}</p>
        <p className="text-xs">
          请到入库管理页添加相应列（或把现有列改成对应名称），保存后回到本页即可。
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="text-muted-foreground text-sm">
          当前默认阈值：
          <span className="text-foreground font-medium">
            {defaultThreshold}
          </span>
          <span className="ml-2 text-xs">
            ·（每个商品可在「预警设置」里单独配置）
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSettingsOpen(true)}
        >
          <IconSettings className="mr-1.5 size-4" />
          预警设置
        </Button>
      </div>

      <SheetGridClient
        sheetId={sheetId}
        readOnly
        hideActionsColumn
        hideFilterPanel
        rowsOverride={rowsOverride}
        rowsOverrideLoading={hitsQuery.isPending}
        rowsOverrideError={hitsQuery.isError ? hitsQuery.error : null}
        printLabelTitle="库存预警"
      />

      <AlertSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        sheetId={sheetId}
        defaultThreshold={defaultThreshold}
        onDefaultThresholdChange={setDefaultThreshold}
      />
    </div>
  )
}
