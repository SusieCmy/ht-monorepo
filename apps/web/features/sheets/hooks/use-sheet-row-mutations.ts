/**
 * 动态表格行的 CRUD mutations。
 *
 * 对应后端接口（iaxixi 项目 / Apifox）：
 *   POST   /sheet-row-index         新增行
 *   PATCH  /sheet-row-index/{id}    更新行（部分字段）
 *   DELETE /sheet-row-index/{id}    删除行
 *
 * 乐观更新策略：增 / 改 / 删都先改 `queryKeys.sheetRows.list({ sheetId })`
 * 这份列表缓存，请求完成后再 invalidate 让服务端的真实值覆盖。这样在
 * 网络偏慢时用户也不会觉得表格卡顿。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiRequest, queryKeys } from "@/lib/query"
import type { SheetRow } from "@/lib/query/options/sheet-rows"

/** 新增一行的入参：列值对象，空字符串也算合法值。 */
export interface CreateSheetRowInput {
  sheetId: number
  values: Record<string, string>
}

/** 更新一行的入参：只 patch 传入的 values；后端决定要不要做全量覆盖。 */
export interface UpdateSheetRowInput {
  id: number
  sheetId: number
  values: Record<string, string>
}

export interface DeleteSheetRowInput {
  id: number
  sheetId: number
}

type RowListKey = ReturnType<typeof queryKeys.sheetRows.list>

/**
 * 一行的乐观临时 id：用负数避免和后端自增主键冲撞，后续 invalidate
 * 拿到真实 id 时会整体替换。
 */
function tempRowId() {
  return -Date.now()
}

/** 新增一行：乐观插入到列表尾部。 */
export function useCreateSheetRow(sheetId: number) {
  const queryClient = useQueryClient()
  const listKey: RowListKey = queryKeys.sheetRows.list({ sheetId })

  return useMutation({
    mutationFn: (input: CreateSheetRowInput) =>
      apiRequest<SheetRow>("/sheet-row-index", {
        method: "POST",
        body: input,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<SheetRow[]>(listKey)
      const optimistic: SheetRow = {
        id: tempRowId(),
        sheetId: input.sheetId,
        values: input.values,
      }
      queryClient.setQueryData<SheetRow[]>(listKey, (current) =>
        current ? [...current, optimistic] : [optimistic],
      )
      return { previous, tempId: optimistic.id }
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(listKey, context.previous)
      }
    },
    onSuccess: (created, _input, context) => {
      // 请求拿到真 id 后，把乐观占位的那一行替换成真行。
      queryClient.setQueryData<SheetRow[]>(listKey, (current) => {
        if (!current) return [created]
        return current.map((row) =>
          row.id === context?.tempId ? created : row,
        )
      })
    },
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: listKey })
    },
  })
}

/** 更新一行：乐观合并 values。 */
export function useUpdateSheetRow(sheetId: number) {
  const queryClient = useQueryClient()
  const listKey: RowListKey = queryKeys.sheetRows.list({ sheetId })

  return useMutation({
    mutationFn: (input: UpdateSheetRowInput) =>
      apiRequest<SheetRow>(`/sheet-row-index/${input.id}`, {
        method: "PATCH",
        body: { values: input.values },
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<SheetRow[]>(listKey)
      queryClient.setQueryData<SheetRow[]>(listKey, (current) =>
        current?.map((row) =>
          row.id === input.id
            ? { ...row, values: { ...row.values, ...input.values } }
            : row,
        ),
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(listKey, context.previous)
      }
    },
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: listKey })
    },
  })
}

/**
 * 批量新增多行：Excel 导入场景。
 *
 * 和 useCreateSheetRow 的差异：
 *  - 不做乐观插入：导入几百条时乐观会让表格闪烁，且失败回滚成本高，
 *    这里选择"等服务端返回"，完成后只 invalidate 一次刷新真实数据。
 *  - 单次调用内部是一个事务（后端保证），所以要么全成功要么全失败。
 */
export function useBulkCreateSheetRows(sheetId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (rows: Array<{ values: Record<string, string> }>) =>
      apiRequest<{ created: number; rows: SheetRow[] }>(
        "/sheet-row-index/bulk",
        {
          method: "POST",
          body: { sheetId, rows },
        },
      ),
    onSettled: () => {
      // 一次性失效所有 sheetRows.list 变体（无 filter / 各种 filter 组合），
      // 让无论用户当前正在看的是全量还是筛选后的视图，都能拿到新行。
      return queryClient.invalidateQueries({
        queryKey: queryKeys.sheetRows.lists(),
      })
    },
  })
}

/** 删除一行。 */
export function useDeleteSheetRow(sheetId: number) {
  const queryClient = useQueryClient()
  const listKey: RowListKey = queryKeys.sheetRows.list({ sheetId })

  return useMutation({
    mutationFn: (input: DeleteSheetRowInput) =>
      apiRequest<void>(`/sheet-row-index/${input.id}`, { method: "DELETE" }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<SheetRow[]>(listKey)
      queryClient.setQueryData<SheetRow[]>(listKey, (current) =>
        current?.filter((row) => row.id !== input.id),
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(listKey, context.previous)
      }
    },
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: listKey })
    },
  })
}
