"use client"

import { useCallback, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { IconTruckDelivery } from "@tabler/icons-react"

import { useConfirm } from "@/components/feedback/confirm-provider"
import { useToast } from "@/components/feedback/toast-provider"
import { options } from "@/lib/query"
import type { SheetRow } from "@/lib/query/options/sheet-rows"

import {
  SheetGridClient,
  type SheetGridClientProps,
} from "@/features/sheets/components/sheet-grid-client"
import type { SheetRowAction } from "@/features/sheets/components/sheet-grid"
import { DispatchQuantityDialog } from "@/features/sheets/components/dispatch-quantity-dialog"
import { ProductDictSyncButton } from "@/features/sheets/components/product-dict-sync-button"
import { MergeDuplicateRowsButton } from "@/features/sheets/components/merge-duplicate-rows-button"
import {
  findColumnIdByCandidates,
  parseStockValue,
  PRODUCT_COLUMN_CANDIDATES,
  STOCK_COLUMN_CANDIDATES,
} from "@/features/sheets/utils/stock-columns"
import {
  useCreateSheetRow,
  useDeleteSheetRow,
  useUpdateSheetRow,
} from "@/features/sheets/hooks/use-sheet-row-mutations"

/**
 * 入库页的 Client Wrapper：负责注入"出库"按钮 + 拆分出库数量的交互。
 *
 * 业务规则：
 *  - 点击「出库」打开数量弹窗，最大值 = 当前库存；
 *  - 出库数量 == 当前库存  →  整行迁移：入库行删除，出库表 create 一条相同 values；
 *  - 出库数量 <  当前库存  →  按差额拆分：入库行库存 -= qty，出库表 create
 *                              一条 values 除库存列改为 qty 外其余复用。
 *  - 库存列名通过候选匹配（库存 / 库存数量 / 数量），没找到时回落到"整行迁移 +
 *    确认弹窗"的老流程，避免页面用不了。
 *
 * 为什么单独一层：
 *  - inbound/page.tsx 是 Server Component（要 PrefetchHydrate），
 *    不能把 onClick 回调直接塞进 SheetGridClient；
 *  - 出库需要用 mutations + 配置查询，只能在 Client Component 里做。
 */
export interface InboundSheetClientProps {
  inboundSheetId: number
  outboundSheetId: number
  title?: SheetGridClientProps["printLabelTitle"]
}

interface DispatchTarget {
  row: SheetRow
  stockColId: string
  currentStock: number
  productName: string
}

export function InboundSheetClient({
  inboundSheetId,
  outboundSheetId,
  title = "入库标签",
}: InboundSheetClientProps) {
  const createOutboundRow = useCreateSheetRow(outboundSheetId)
  const updateInboundRow = useUpdateSheetRow(inboundSheetId)
  const deleteInboundRow = useDeleteSheetRow(inboundSheetId)
  const confirm = useConfirm()
  const toast = useToast()

  // 为了在"出库"按钮里读库存，必须先知道库存列 id。sheetConfigDetailOptions
  // 已经被 Server 端 PrefetchHydrate 预取过，这里只是 SSR 水合后本地读取。
  const configQuery = useQuery(
    options.sheetConfigs.sheetConfigDetailOptions(inboundSheetId),
  )
  const columns = configQuery.data?.columns ?? []

  const stockColId = useMemo(
    () => findColumnIdByCandidates(columns, STOCK_COLUMN_CANDIDATES),
    [columns],
  )
  const productColId = useMemo(
    () => findColumnIdByCandidates(columns, PRODUCT_COLUMN_CANDIDATES),
    [columns],
  )

  const [dispatchTarget, setDispatchTarget] = useState<DispatchTarget | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)

  /** 整行迁移：出库数量 = 当前库存，或者根本没有库存列。 */
  const fullDispatch = useCallback(
    async (row: SheetRow) => {
      try {
        await createOutboundRow.mutateAsync({
          sheetId: outboundSheetId,
          values: row.values ?? {},
        })
      } catch (err) {
        toast.error({
          title: "出库失败",
          description:
            err instanceof Error
              ? `写入出库表出错：${err.message}`
              : "写入出库表时出错，请稍后重试。",
        })
        return
      }

      // 出库写入成功才删源行；即使 delete 失败，数据也没丢，只是两边各一条
      // 可以手动清理。
      deleteInboundRow.mutate(
        { sheetId: inboundSheetId, id: row.id },
        {
          onSuccess: () =>
            toast.success({
              title: "出库成功",
              description: `#${row.id} 已从入库表移除，可在出库管理查看。`,
            }),
          onError: (err) =>
            toast.warning({
              title: "出库已登记，但原入库行未能移除",
              description:
                err instanceof Error
                  ? `请手动在入库表删除 #${row.id}：${err.message}`
                  : `请手动在入库表删除 #${row.id}。`,
              durationMs: 6000,
            }),
        },
      )
    },
    [createOutboundRow, deleteInboundRow, inboundSheetId, outboundSheetId, toast],
  )

  /** 拆分出库：入库行库存 -= qty，出库表新建一行 values 复用（库存列改为 qty）。 */
  const partialDispatch = useCallback(
    async (target: DispatchTarget, qty: number) => {
      const { row, stockColId, currentStock } = target
      const remaining = currentStock - qty
      const outboundValues: Record<string, string> = {
        ...(row.values ?? {}),
        [stockColId]: String(qty),
      }

      try {
        await createOutboundRow.mutateAsync({
          sheetId: outboundSheetId,
          values: outboundValues,
        })
      } catch (err) {
        toast.error({
          title: "出库失败",
          description:
            err instanceof Error
              ? `写入出库表出错：${err.message}`
              : "写入出库表时出错，请稍后重试。",
        })
        throw err
      }

      // 出库已登记，哪怕入库扣减失败，数据也没丢 —— 只是入库侧数字偏大，
      // 提示用户手动修正比回滚整条出库记录对账务更友好。
      try {
        await updateInboundRow.mutateAsync({
          id: row.id,
          sheetId: inboundSheetId,
          values: { [stockColId]: String(remaining) },
        })
        toast.success({
          title: "出库成功",
          description: `已出库 ${qty}，入库剩余 ${remaining}。`,
        })
      } catch (err) {
        toast.warning({
          title: "出库已登记，但入库库存扣减失败",
          description:
            err instanceof Error
              ? `请手动把 #${row.id} 的库存改为 ${remaining}：${err.message}`
              : `请手动把 #${row.id} 的库存改为 ${remaining}。`,
          durationMs: 6000,
        })
      }
    },
    [
      createOutboundRow,
      updateInboundRow,
      inboundSheetId,
      outboundSheetId,
      toast,
    ],
  )

  const handleDispatchClick = useCallback(
    async (row: SheetRow) => {
      // 没识别到库存列 —— 回落到老的"整行迁移 + 确认"交互，保证功能不会因
      // 列名不规范而完全不可用。
      if (!stockColId) {
        const ok = await confirm({
          title: "确认出库？",
          description: (
            <>
              当前入库表未识别到"库存 / 数量"列，将整行迁移到出库表。
              <br />
              将把 <span className="font-mono">#{row.id}</span> 这条记录从入库表
              搬到出库表，原入库记录会被移除。
            </>
          ),
          confirmText: "确认出库",
          tone: "warning",
        })
        if (!ok) return
        await fullDispatch(row)
        return
      }

      const current = parseStockValue(row.values?.[stockColId])
      if (current === null || current <= 0) {
        // 库存列为空 / 0 / 非法时也走整行迁移：用户可能只是忘了填数量，
        // 不应该一锁死就让他操作不了。
        const ok = await confirm({
          title: "确认出库？",
          description: (
            <>
              <span className="font-mono">#{row.id}</span>
              这一行未填写库存数量，将整行迁移到出库表。
            </>
          ),
          confirmText: "确认出库",
          tone: "warning",
        })
        if (!ok) return
        await fullDispatch(row)
        return
      }

      const productName =
        (productColId ? row.values?.[productColId] : undefined) ?? ""
      setDispatchTarget({
        row,
        stockColId,
        currentStock: current,
        productName,
      })
    },
    [confirm, fullDispatch, productColId, stockColId],
  )

  const handleConfirmQuantity = useCallback(
    async (qty: number) => {
      if (!dispatchTarget) return
      setSubmitting(true)
      try {
        if (qty >= dispatchTarget.currentStock) {
          await fullDispatch(dispatchTarget.row)
        } else {
          await partialDispatch(dispatchTarget, qty)
        }
        setDispatchTarget(null)
      } catch {
        // 错误 toast 已在子流程里弹，这里保持弹窗打开让用户可以重试或改数量。
      } finally {
        setSubmitting(false)
      }
    },
    [dispatchTarget, fullDispatch, partialDispatch],
  )

  const rowActions = useMemo<SheetRowAction[]>(
    () => [
      {
        id: "dispatch",
        label: "出库",
        icon: IconTruckDelivery,
        onClick: handleDispatchClick,
      },
    ],
    [handleDispatchClick],
  )

  const rowSummary = dispatchTarget ? (
    <>
      <div>
        行号：
        <span className="text-foreground font-mono">
          #{dispatchTarget.row.id}
        </span>
      </div>
      {dispatchTarget.productName ? (
        <div>
          商品：
          <span className="text-foreground">{dispatchTarget.productName}</span>
        </div>
      ) : null}
    </>
  ) : null

  return (
    <>
      <div className="flex items-center justify-end gap-2 border-b px-3 py-2">
        {/*
          表格上方的工具按钮区。左到右按使用顺序排：
            1. 合并重复商品：先把历史脏数据合成一行；
            2. 启用商品字典：把商品列规范化为字典下拉。
          同属一次性治理动作，做完之后这里可以放别的批量工具。
        */}
        <MergeDuplicateRowsButton sheetId={inboundSheetId} />
        <ProductDictSyncButton
          inboundSheetId={inboundSheetId}
          outboundSheetId={outboundSheetId}
        />
      </div>
      <SheetGridClient
        sheetId={inboundSheetId}
        rowActions={rowActions}
        printLabelTitle={title}
      />
      <DispatchQuantityDialog
        open={dispatchTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDispatchTarget(null)
        }}
        currentStock={dispatchTarget?.currentStock ?? 0}
        rowSummary={rowSummary}
        onConfirm={handleConfirmQuantity}
        submitting={submitting}
      />
    </>
  )
}
