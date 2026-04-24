"use client"

/**
 * "启用商品字典"一键工具按钮。
 *
 * 做三件事：
 *  1. 调 /dict-type/bootstrap-from-sheet-column：把入库表"商品名称"列
 *     所有 DISTINCT 值导入 `product_name` 字典（字典类型不存在会自动建）；
 *  2. PATCH 入库表 config：把商品列的 type 改为 "dict"，dictTypeCode=product_name；
 *  3. PATCH 出库表 config：同步改出库表的商品列（如果它也识别到了），
 *     保证两张表编辑体验一致。
 *
 * 为什么放这里而不是全局菜单：属于"初始化 / 数据治理"的一次性动作，
 * 放在入库管理页顶部，用户配置完列再点一下即可。点完之后两张表的
 * 商品列都变成下拉选择，历史数据因为 label 已经提前灌进字典，显示不会丢。
 */

import { useMemo, useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconDatabaseCog } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

import { useConfirm } from "@/components/feedback/confirm-provider"
import { useToast } from "@/components/feedback/toast-provider"
import { apiRequest, options, queryKeys } from "@/lib/query"
import type { SheetColumn } from "@/lib/query/options/sheet-configs"

import { useBootstrapDictFromSheetColumn } from "@/features/dicts/hooks/use-bootstrap-dict"
import {
  findColumnIdByCandidates,
  PRODUCT_COLUMN_CANDIDATES,
} from "@/features/sheets/utils/stock-columns"

const PRODUCT_DICT_TYPE_CODE = "product_name"
const PRODUCT_DICT_TYPE_NAME = "商品名称"

export interface ProductDictSyncButtonProps {
  inboundSheetId: number
  outboundSheetId: number
}

/**
 * 用 apiRequest 直接 PATCH /sheet-config/:id 而不是复用 mutation hook：
 * 因为我们需要按两张不同的 sheetId 调用，且需要在拿到服务端返回后手动
 * 更新各自的 detail 缓存 —— hook 是"单 sheet 绑定"的，强行套反而更乱。
 */
async function patchSheetColumns(
  sheetId: number,
  nextColumns: SheetColumn[],
) {
  return apiRequest<{ id: number; columns: SheetColumn[] }>(
    `/sheet-config/${sheetId}`,
    {
      method: "PATCH",
      body: { columns: nextColumns },
    },
  )
}

export function ProductDictSyncButton({
  inboundSheetId,
  outboundSheetId,
}: ProductDictSyncButtonProps) {
  const inboundConfig = useQuery(
    options.sheetConfigs.sheetConfigDetailOptions(inboundSheetId),
  )
  const outboundConfig = useQuery(
    options.sheetConfigs.sheetConfigDetailOptions(outboundSheetId),
  )
  const bootstrap = useBootstrapDictFromSheetColumn()
  const confirm = useConfirm()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)

  const inboundProductColId = useMemo(
    () =>
      findColumnIdByCandidates(
        inboundConfig.data?.columns ?? [],
        PRODUCT_COLUMN_CANDIDATES,
      ),
    [inboundConfig.data?.columns],
  )

  const outboundProductColId = useMemo(
    () =>
      findColumnIdByCandidates(
        outboundConfig.data?.columns ?? [],
        PRODUCT_COLUMN_CANDIDATES,
      ),
    [outboundConfig.data?.columns],
  )

  // 只有入库表能确定商品列才有意义启用按钮；出库表没有商品列也没关系，
  // 第三步会优雅跳过。
  const disabled =
    running ||
    inboundConfig.isPending ||
    outboundConfig.isPending ||
    !inboundProductColId

  const handleClick = async () => {
    if (!inboundProductColId || !inboundConfig.data) return

    const inboundCol = inboundConfig.data.columns.find(
      (c) => c.id === inboundProductColId,
    )
    const alreadyDict =
      inboundCol?.type === "dict" &&
      inboundCol.dictTypeCode === PRODUCT_DICT_TYPE_CODE

    const ok = await confirm({
      title: alreadyDict ? "同步商品字典？" : "启用商品字典管理？",
      description: alreadyDict ? (
        <>
          入库表商品列已经是字典类型。继续将把表里目前所有商品名的
          DISTINCT 值同步到
          <span className="font-mono"> {PRODUCT_DICT_TYPE_CODE} </span>
          字典（已有条目会跳过）。
        </>
      ) : (
        <>
          将把入库表里所有 DISTINCT 商品名导入
          <span className="font-mono"> {PRODUCT_DICT_TYPE_CODE} </span>
          字典，并把入库/出库表的商品列改为<b>字典下拉</b>类型。此后
          编辑单元格只能从字典里选，避免重名/错字。
        </>
      ),
      confirmText: alreadyDict ? "同步" : "启用并同步",
      tone: "info",
    })
    if (!ok) return

    setRunning(true)
    try {
      // Step 1: 导入 DISTINCT 值到字典
      const result = await bootstrap.mutateAsync({
        typeCode: PRODUCT_DICT_TYPE_CODE,
        typeName: PRODUCT_DICT_TYPE_NAME,
        sheetId: inboundSheetId,
        columnId: inboundProductColId,
      })

      // Step 2: 入库表商品列改为 dict
      if (!alreadyDict) {
        const nextInbound = inboundConfig.data.columns.map<SheetColumn>((c) =>
          c.id === inboundProductColId
            ? { ...c, type: "dict", dictTypeCode: PRODUCT_DICT_TYPE_CODE }
            : c,
        )
        const savedInbound = await patchSheetColumns(inboundSheetId, nextInbound)
        queryClient.setQueryData(
          queryKeys.sheetConfigs.detail(inboundSheetId),
          savedInbound,
        )
      }

      // Step 3: 出库表商品列同步（找得到列才改；列 id 可能和入库表不同）。
      if (outboundConfig.data && outboundProductColId) {
        const outboundCol = outboundConfig.data.columns.find(
          (c) => c.id === outboundProductColId,
        )
        const outboundAlreadyDict =
          outboundCol?.type === "dict" &&
          outboundCol.dictTypeCode === PRODUCT_DICT_TYPE_CODE
        if (!outboundAlreadyDict) {
          const nextOutbound = outboundConfig.data.columns.map<SheetColumn>(
            (c) =>
              c.id === outboundProductColId
                ? { ...c, type: "dict", dictTypeCode: PRODUCT_DICT_TYPE_CODE }
                : c,
          )
          const savedOutbound = await patchSheetColumns(
            outboundSheetId,
            nextOutbound,
          )
          queryClient.setQueryData(
            queryKeys.sheetConfigs.detail(outboundSheetId),
            savedOutbound,
          )
        }
      }

      // 顺便让所有 sheet-config 列表缓存失效（字典管理页 / 添加列下拉会用到）。
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sheetConfigs.all,
      })

      toast.success({
        title: alreadyDict ? "商品字典已同步" : "商品字典已启用",
        description: `新增 ${result.added.length} 个商品项，已有 ${result.existingCount} 个跳过；共识别 ${result.totalDistinct} 个商品。`,
      })
    } catch (err) {
      toast.error({
        title: "操作失败",
        description: err instanceof Error ? err.message : "未知错误",
      })
    } finally {
      setRunning(false)
    }
  }

  if (!inboundProductColId && !inboundConfig.isPending) {
    // 入库表根本没识别到商品列，按钮直接不渲染，避免用户好奇点了报错。
    return null
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      title="把入库表里的商品名称同步到字典，并把商品列切换成下拉选择"
    >
      <IconDatabaseCog className="mr-1.5 size-4" />
      {running ? "同步中…" : "启用商品字典"}
    </Button>
  )
}
