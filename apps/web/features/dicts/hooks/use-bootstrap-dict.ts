/**
 * 字典自举 mutation：把某张表格某一列的 DISTINCT 值导入字典。
 *
 * 对应后端：POST /dict-type/bootstrap-from-sheet-column
 *
 * 成功后需要失效两类缓存：
 *  - 字典类型列表（新建了 product_name 的话，字典管理页应该能看到）；
 *  - 对应 typeCode 的字典项列表（新增了 items）。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiRequest, queryKeys } from "@/lib/query"
import type { DictItem, DictType } from "@/lib/query/options/dicts"

export interface BootstrapDictInput {
  typeCode: string
  typeName?: string
  typeDescription?: string
  sheetId: number
  columnId: string
}

export interface BootstrapDictResult {
  type: DictType
  added: DictItem[]
  existingCount: number
  totalDistinct: number
}

export function useBootstrapDictFromSheetColumn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: BootstrapDictInput) =>
      apiRequest<BootstrapDictResult>(
        "/dict-type/bootstrap-from-sheet-column",
        { method: "POST", body: input },
      ),
    onSettled: (_data, _err, variables) => {
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.dictTypes.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.dictItems.list({ typeCode: variables.typeCode }),
        }),
      ])
    },
  })
}
