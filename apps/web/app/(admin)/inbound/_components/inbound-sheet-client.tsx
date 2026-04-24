"use client"

import { useMemo } from "react"

import { IconTruckDelivery } from "@tabler/icons-react"

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
 * 入库页的 Client Wrapper：负责注入"出库"按钮。
 *
 * 为什么单独一层：
 *  - inbound/page.tsx 是 Server Component（要 PrefetchHydrate），
 *    不能把 onClick 回调直接塞进 SheetGridClient；
 *  - 出库需要调用 queries/mutations（useCreateSheetRow / useDeleteSheetRow），
 *    只能在 Client Component 里做。
 *
 * 业务含义：点击"出库"即把当前行从入库 sheet 搬到出库 sheet —
 *   1. 在 OUTBOUND_SHEET_ID 里 create 一行 values 相同的新记录；
 *   2. 成功后再从入库 sheet 里 delete 源行。
 * 两张表的 column 配置若不同，values 里多出来的 key 会被忽略（后端 JSON
 * 直接整体存），欠缺的 key 会是 undefined。真要做字段映射可以扩展这层。
 */
export interface InboundSheetClientProps {
  inboundSheetId: number
  outboundSheetId: number
  title?: SheetGridClientProps["printLabelTitle"]
}

export function InboundSheetClient({
  inboundSheetId,
  outboundSheetId,
  title = "入库标签",
}: InboundSheetClientProps) {
  const createOutboundRow = useCreateSheetRow(outboundSheetId)
  const deleteInboundRow = useDeleteSheetRow(inboundSheetId)
  const confirm = useConfirm()
  const toast = useToast()

  const rowActions = useMemo<SheetRowAction[]>(
    () => [
      {
        id: "dispatch",
        label: "出库",
        icon: IconTruckDelivery,
        onClick: async (row) => {
          const ok = await confirm({
            title: "确认出库？",
            description: (
              <>
                将把 <span className="font-mono">#{row.id}</span>
                这条记录从入库表迁移到出库表，原入库记录会被移除。
              </>
            ),
            confirmText: "确认出库",
            tone: "warning",
          })
          if (!ok) return

          try {
            await createOutboundRow.mutateAsync({
              sheetId: outboundSheetId,
              values: row.values ?? {},
            })
          } catch (err) {
            console.error("[inbound:dispatch] 写入出库表失败", err)
            toast.error({
              title: "出库失败",
              description:
                err instanceof Error
                  ? `写入出库表出错：${err.message}`
                  : "写入出库表时出错，请稍后重试。",
            })
            return
          }

          // 写入成功才删除源行；即使 delete 失败，数据也不会丢，
          // 只是会两边各存一条，可以手动清理。
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
      },
    ],
    [confirm, createOutboundRow, deleteInboundRow, inboundSheetId, outboundSheetId, toast],
  )

  return (
    <SheetGridClient
      sheetId={inboundSheetId}
      rowActions={rowActions}
      printLabelTitle={title}
    />
  )
}
