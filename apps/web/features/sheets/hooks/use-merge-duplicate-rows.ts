/**
 * 合并同 sheet 内按"商品名"重复的行。
 *
 * 对应后端：POST /sheet-row-index/merge-duplicates
 *
 * 合并是一次性的治理动作，执行完后需要刷新两份缓存：
 *  - sheet-rows 列表（被合并行的 id 已经不存在）
 *  - alert-hits 列表（库存累加后可能跨过预警阈值）
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiRequest, queryKeys } from "@/lib/query"

export interface MergeDuplicateRowsInput {
  sheetId: number
  productColumnId: string
  stockColumnId: string
}

export interface MergeDuplicateRowsResult {
  mergedGroups: number
  removedRows: number
  groupsChecked: number
  details: Array<{
    productName: string
    keptId: number
    removedIds: number[]
    mergedStock: string
  }>
}

export function useMergeDuplicateRows() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: MergeDuplicateRowsInput) =>
      apiRequest<MergeDuplicateRowsResult>("/sheet-row-index/merge-duplicates", {
        method: "POST",
        body: input,
      }),
    onSettled: (_data, _err, variables) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.sheetRows.list({ sheetId: variables.sheetId }),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.alertHits.lists(),
        }),
      ])
    },
  })
}
