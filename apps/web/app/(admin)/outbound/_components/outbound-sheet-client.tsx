"use client"

import { useCallback, useMemo } from "react"

import { useQuery } from "@tanstack/react-query"
import { IconArrowBackUp } from "@tabler/icons-react"

import { useConfirm } from "@/components/feedback/confirm-provider"
import { useToast } from "@/components/feedback/toast-provider"
import { apiRequest, options } from "@/lib/query"
import type { SheetRow } from "@/lib/query/options/sheet-rows"

import {
  SheetGridClient,
  type SheetGridClientProps,
} from "@/features/sheets/components/sheet-grid-client"
import type { SheetRowAction } from "@/features/sheets/components/sheet-grid"
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
 * 出库页的 Client Wrapper：负责注入"返库"按钮。
 *
 * 返库策略（合并模式）：
 *  1. 读入库表 config 找到"商品名称列"和"库存列"；
 *  2. 用 /sheet-row-index/query 按商品名精确匹配入库表，看是否已有同商品的行；
 *  3. 已存在 → UPDATE 该行库存 += 出库行的库存（合并），不新建行；
 *  4. 不存在 → 按老策略 CREATE 一条新入库行（values 整体复用）；
 *  5. 成功后 DELETE 源出库行。
 *
 * 之所以要合并：如果每次返库都 create 一条新入库行，库里"同一个商品"会变成
 * 很多条分散记录，预警、导出、报表都会乱。商品名只要对上就合并是最自然的。
 *
 * 没识别到商品列或库存列 → 回落到老流程（整行 create + delete 源行），
 * 保证兼容早期没字典化的表。
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
  const updateInboundRow = useUpdateSheetRow(inboundSheetId)
  const deleteOutboundRow = useDeleteSheetRow(outboundSheetId)
  const confirm = useConfirm()
  const toast = useToast()

  // 读入库表的 config：用于定位商品列 / 库存列。
  const inboundConfigQuery = useQuery(
    options.sheetConfigs.sheetConfigDetailOptions(inboundSheetId),
  )
  const inboundColumns = inboundConfigQuery.data?.columns ?? []

  const productColId = useMemo(
    () => findColumnIdByCandidates(inboundColumns, PRODUCT_COLUMN_CANDIDATES),
    [inboundColumns],
  )
  const stockColId = useMemo(
    () => findColumnIdByCandidates(inboundColumns, STOCK_COLUMN_CANDIDATES),
    [inboundColumns],
  )

  const handleReturn = useCallback(
    async (row: SheetRow) => {
      const productName = productColId
        ? (row.values?.[productColId] ?? "").trim()
        : ""
      const returningQty = stockColId
        ? parseStockValue(row.values?.[stockColId])
        : null

      // 先把场景摆给用户看：
      //  - 识别到商品 + 数量 → 说明会尝试合并；
      //  - 识别不到 → 落回老流程。
      const canMerge =
        Boolean(productColId) &&
        Boolean(stockColId) &&
        productName !== "" &&
        returningQty !== null &&
        returningQty > 0
      const ok = await confirm({
        title: "确认返库？",
        description: canMerge ? (
          <>
            将把
            <span className="font-mono"> #{row.id} </span>
            返库
            <span className="font-semibold"> {returningQty} </span>
            个「
            <span className="font-semibold">{productName}</span>
            」，若入库表已有同商品记录会合并到原行，否则新建一条。
          </>
        ) : (
          <>
            将把
            <span className="font-mono"> #{row.id} </span>
            这条记录从出库表迁回入库表（未识别到商品 / 库存列，整行迁移）。
          </>
        ),
        confirmText: "确认返库",
        tone: "warning",
      })
      if (!ok) return

      // ========================= 合并路径 =========================
      if (canMerge) {
        // 1. 查入库表里是否已有同商品行。
        let existingRows: SheetRow[] = []
        try {
          const raw = await apiRequest<unknown[]>("/sheet-row-index/query", {
            method: "POST",
            body: {
              sheetId: inboundSheetId,
              filters: {
                [productColId as string]: { value: productName },
              },
            },
          })
          existingRows = Array.isArray(raw) ? (raw as SheetRow[]) : []
        } catch (err) {
          toast.error({
            title: "返库失败",
            description:
              err instanceof Error
                ? `查询入库表出错：${err.message}`
                : "查询入库表时出错，请稍后重试。",
          })
          return
        }

        // 精确匹配同名行；后端 query 用 eq（服务端过滤），这里保险起见再
        // 按 productName 再滤一次，防止后端返回误带数据。
        const matched = existingRows.find(
          (r) => (r.values?.[productColId as string] ?? "").trim() === productName,
        )

        // 2. 命中 → 在原行库存上累加返库数量。
        if (matched) {
          const current =
            parseStockValue(matched.values?.[stockColId as string]) ?? 0
          const merged = current + (returningQty as number)
          try {
            await updateInboundRow.mutateAsync({
              id: matched.id,
              sheetId: inboundSheetId,
              values: { [stockColId as string]: String(merged) },
            })
          } catch (err) {
            toast.error({
              title: "返库失败",
              description:
                err instanceof Error
                  ? `入库库存累加出错：${err.message}`
                  : "入库库存累加时出错，请稍后重试。",
            })
            return
          }
          deleteOutboundRow.mutate(
            { sheetId: outboundSheetId, id: row.id },
            {
              onSuccess: () =>
                toast.success({
                  title: "返库成功",
                  description: `已把 ${returningQty} 个「${productName}」合并到入库 #${matched.id}，当前库存 ${merged}。`,
                }),
              onError: (err) =>
                toast.warning({
                  title: "返库已合并，但原出库行未能移除",
                  description:
                    err instanceof Error
                      ? `请手动在出库表删除 #${row.id}：${err.message}`
                      : `请手动在出库表删除 #${row.id}。`,
                  durationMs: 6000,
                }),
            },
          )
          return
        }

        // 3. 没命中 → 按新增处理，落到下面的通用 create 路径（复用 row.values）。
      }

      // ========================= 通用 create 路径 =========================
      try {
        await createInboundRow.mutateAsync({
          sheetId: inboundSheetId,
          values: row.values ?? {},
        })
      } catch (err) {
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
              description: canMerge
                ? `入库表暂无「${productName}」，已作为新入库记录保存。`
                : `#${row.id} 已从出库表移除，可在入库管理查看。`,
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
    [
      confirm,
      createInboundRow,
      deleteOutboundRow,
      inboundSheetId,
      outboundSheetId,
      productColId,
      stockColId,
      toast,
      updateInboundRow,
    ],
  )

  const rowActions = useMemo<SheetRowAction[]>(
    () => [
      {
        id: "return",
        label: "返库",
        icon: IconArrowBackUp,
        onClick: handleReturn,
      },
    ],
    [handleReturn],
  )

  return (
    <SheetGridClient
      sheetId={outboundSheetId}
      rowActions={rowActions}
      printLabelTitle={title}
    />
  )
}
