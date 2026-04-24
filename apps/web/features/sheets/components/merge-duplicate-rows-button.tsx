"use client"

/**
 * "合并重复商品"按钮：把入库表里商品名相同的多行合并为一行（库存累加）。
 *
 * 典型用例：历史上返库都是 create 一条新入库行，导致同一个商品在入库表里
 * 被拆成多条。上线字典化之前先点一下这个按钮清理历史数据。
 *
 * 合并规则（后端）：
 *  - 按 productColumnId group by（trim 空白），空值跳过；
 *  - 同组保留 id 最小行 kept，其他行 stockColumnId 数值累加进 kept；
 *  - 其它业务字段（规格、分类等）不动，用 kept 原值；
 *  - 事务里完成，库存改动和行删除要么全成要么全回。
 *
 * 识别不到商品列或库存列就不渲染按钮，避免按了报错。
 */

import { useMemo } from "react"

import { useQuery } from "@tanstack/react-query"
import { IconStack2 } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

import { useConfirm } from "@/components/feedback/confirm-provider"
import { useToast } from "@/components/feedback/toast-provider"
import { options } from "@/lib/query"

import { useMergeDuplicateRows } from "@/features/sheets/hooks/use-merge-duplicate-rows"
import {
  findColumnIdByCandidates,
  PRODUCT_COLUMN_CANDIDATES,
  STOCK_COLUMN_CANDIDATES,
} from "@/features/sheets/utils/stock-columns"

export interface MergeDuplicateRowsButtonProps {
  sheetId: number
}

export function MergeDuplicateRowsButton({
  sheetId,
}: MergeDuplicateRowsButtonProps) {
  const configQuery = useQuery(
    options.sheetConfigs.sheetConfigDetailOptions(sheetId),
  )
  const columns = configQuery.data?.columns ?? []

  const productColId = useMemo(
    () => findColumnIdByCandidates(columns, PRODUCT_COLUMN_CANDIDATES),
    [columns],
  )
  const stockColId = useMemo(
    () => findColumnIdByCandidates(columns, STOCK_COLUMN_CANDIDATES),
    [columns],
  )

  const merge = useMergeDuplicateRows()
  const confirm = useConfirm()
  const toast = useToast()

  const disabled = merge.isPending || configQuery.isPending

  // 两个关键列一个都缺就不要出这个按钮：没有库存列没法做累加，没有商品列
  // 没法分组。直接不渲染，比 disable 更清爽。
  if (!productColId || !stockColId) {
    if (configQuery.isPending) return null
    return null
  }

  const handleClick = async () => {
    const ok = await confirm({
      title: "合并同名商品的重复行？",
      description: (
        <>
          将按<b>商品名称</b>
          把入库表里重复的行合并成一条，
          <b>库存数量会累加</b>，其它字段保留 id 最小那条的原值。
          <br />
          此操作会<b>删除被合并掉的行</b>，不能撤销，建议确认后再执行。
        </>
      ),
      confirmText: "执行合并",
      tone: "warning",
    })
    if (!ok) return

    try {
      const result = await merge.mutateAsync({
        sheetId,
        productColumnId: productColId,
        stockColumnId: stockColId,
      })
      if (result.removedRows === 0) {
        toast.info({
          title: "未发现需合并的数据",
          description: `共检查 ${result.groupsChecked} 个商品分组，每个商品只有 1 条记录。`,
        })
      } else {
        toast.success({
          title: "合并完成",
          description: `共合并 ${result.mergedGroups} 个商品，删除 ${result.removedRows} 条重复行。`,
        })
      }
    } catch (err) {
      toast.error({
        title: "合并失败",
        description: err instanceof Error ? err.message : "未知错误，请稍后重试。",
      })
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      title="把同商品的多条行合并成一条，库存数量累加"
    >
      <IconStack2 className="mr-1.5 size-4" />
      {merge.isPending ? "合并中…" : "合并重复商品"}
    </Button>
  )
}
