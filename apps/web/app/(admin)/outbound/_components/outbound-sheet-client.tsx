"use client"

import { useMemo } from "react"

import { IconArrowBackUp } from "@tabler/icons-react"

import { useConfirm } from "@/components/feedback/confirm-provider"
import { useToast } from "@/components/feedback/toast-provider"
import {
  SheetGridClient,
  type SheetGridClientProps,
} from "@/features/sheets/components/sheet-grid-client"
import type { SheetRowAction } from "@/features/sheets/components/sheet-grid"
import {
  useCreateSheetRow,
  useDeleteSheetRow,
} from "@/features/sheets/hooks/use-sheet-row-mutations"

/**
 * 出库页的 Client Wrapper：负责注入"返库"按钮。
 *
 * 与 `InboundSheetClient` 严格对称：
 *  - 入库页：出库 = 入库表 delete → 出库表 create
 *  - 出库页：返库 = 出库表 delete → 入库表 create
 *
 * 实现顺序：
 *   1. 先向入库表 create 一份 values 相同的新记录；
 *   2. 成功后再从出库表 delete 源行。
 * 即使 step 2 失败，数据也不会丢 —— 会出现两边各存一条，可以手动清理；
 * 反过来（先删后建）一旦 create 失败，这条数据就真丢了，不能接受。
 */
export interface OutboundSheetClientProps {
  outboundSheetId: number
  inboundSheetId: number
  title?: SheetGridClientProps["printLabelTitle"]
}

export function OutboundSheetClient({
  outboundSheetId,
  inboundSheetId,
  title = "出库标签",
}: OutboundSheetClientProps) {
  const createInboundRow = useCreateSheetRow(inboundSheetId)
  const deleteOutboundRow = useDeleteSheetRow(outboundSheetId)
  const confirm = useConfirm()
  const toast = useToast()

  const rowActions = useMemo<SheetRowAction[]>(
    () => [
      {
        id: "return",
        label: "返库",
        icon: IconArrowBackUp,
        onClick: async (row) => {
          const ok = await confirm({
            title: "确认返库？",
            description: (
              <>
                将把 <span className="font-mono">#{row.id}</span>
                这条记录从出库表迁回入库表，原出库记录会被移除。
              </>
            ),
            confirmText: "确认返库",
            tone: "warning",
          })
          if (!ok) return

          try {
            await createInboundRow.mutateAsync({
              sheetId: inboundSheetId,
              values: row.values ?? {},
            })
          } catch (err) {
            console.error("[outbound:return] 写入入库表失败", err)
            toast.error({
              title: "返库失败",
              description:
                err instanceof Error
                  ? `写入入库表出错：${err.message}`
                  : "写入入库表时出错，请稍后重试。",
            })
            return
          }

          deleteOutboundRow.mutate(
            { sheetId: outboundSheetId, id: row.id },
            {
              onSuccess: () =>
                toast.success({
                  title: "返库成功",
                  description: `#${row.id} 已从出库表移除，可在入库管理查看。`,
                }),
              onError: (err) =>
                toast.warning({
                  title: "返库已登记，但原出库行未能移除",
                  description:
                    err instanceof Error
                      ? `请手动在出库表删除 #${row.id}：${err.message}`
                      : `请手动在出库表删除 #${row.id}。`,
                  durationMs: 6000,
                }),
            },
          )
        },
      },
    ],
    [confirm, createInboundRow, deleteOutboundRow, inboundSheetId, outboundSheetId, toast],
  )

  return (
    <SheetGridClient
      sheetId={outboundSheetId}
      rowActions={rowActions}
      printLabelTitle={title}
    />
  )
}
