/**
 * ?????? CRUD mutations?
 *
 * ???????iaxixi ?? / Apifox??
 *   POST   /sheet-row-index         ???
 *   PATCH  /sheet-row-index/{id}    ?????????
 *   DELETE /sheet-row-index/{id}    ???
 *
 * ???????? / ? / ???? `queryKeys.sheetRows.list({ sheetId })`
 * ????????????? invalidate ??????????????
 * ?????????????????
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiRequest, queryKeys } from "@/lib/query"
import type { SheetRow } from "@/lib/query/options/sheet-rows"

/** ??????????????????????? */
export interface CreateSheetRowInput {
  sheetId: number
  values: Record<string, string>
}

/** ????????? patch ??? values?????????????? */
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
 * ??????? id?????????????????? invalidate
 * ???? id ???????
 */
function tempRowId() {
  return -Date.now()
}

/**
 * ??????????????????? / ?? / ?? / ????
 * ???????????????? mutation ??? onSettled ?
 * ?? invalidate `alertHits.lists()`?
 *
 * ????"??"???TanStack Query ???? observer ? key ??
 * ? refetch?????????????????????
 */
function invalidateRowAndAlerts(
  queryClient: ReturnType<typeof useQueryClient>,
  listKey: RowListKey,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: listKey }),
    queryClient.invalidateQueries({ queryKey: queryKeys.alertHits.lists() }),
  ])
}

/** ??????????????? */
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
      queryClient.setQueryData<SheetRow[]>(listKey, (current) => {
        if (!current) return [created]
        return current.map((row) =>
          row.id === context?.tempId ? created : row,
        )
      })
    },
    onSettled: () => invalidateRowAndAlerts(queryClient, listKey),
  })
}

/** ????????? values? */
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
    onSettled: () => invalidateRowAndAlerts(queryClient, listKey),
  })
}

/**
 * ???????Excel ?????
 *
 * ? useCreateSheetRow ????
 *  - ???????????????????????????????
 *    ????"??????"????? invalidate ?????????
 *  - ???????????????????????????????
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
      // ??????? sheetRows.list ???? filter / ?? filter ????
      // ??????????????????????????????
      // ?????????????
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.sheetRows.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.alertHits.lists(),
        }),
      ])
    },
  })
}

/** ????? */
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
    onSettled: () => invalidateRowAndAlerts(queryClient, listKey),
  })
}
