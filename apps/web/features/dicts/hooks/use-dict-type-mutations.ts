/**
 * 字典类型（dict_type）的 CRUD mutations。
 *
 * 对应后端：
 *   POST   /dict-type
 *   PATCH  /dict-type/:id
 *   DELETE /dict-type/:id
 *
 * 缓存策略：
 *  - 列表缓存 key：queryKeys.dictTypes.lists()
 *  - 新增/改/删后统一 invalidate 这一组；删除类型时顺便把对应字典项
 *    `dictItems.list({ typeCode })` 也一起失效。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiRequest, queryKeys } from "@/lib/query"
import type { DictType } from "@/lib/query/options/dicts"

export interface CreateDictTypeInput {
  code: string
  name: string
  description?: string
}

export interface UpdateDictTypeInput {
  id: number
  code?: string
  name?: string
  description?: string
  /** 旧 code，用于识别是否需要 invalidate 旧的 items 列表缓存。 */
  previousCode?: string
}

export interface DeleteDictTypeInput {
  id: number
  /** 删除成功后用来定向 invalidate 对应 items 列表。 */
  code: string
}

export function useCreateDictType() {
  const queryClient = useQueryClient()
  const listKey = queryKeys.dictTypes.lists()

  return useMutation({
    mutationFn: (input: CreateDictTypeInput) =>
      apiRequest<DictType>("/dict-type", {
        method: "POST",
        body: input,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })
}

export function useUpdateDictType() {
  const queryClient = useQueryClient()
  const listKey = queryKeys.dictTypes.lists()

  return useMutation({
    mutationFn: (input: UpdateDictTypeInput) => {
      const { id, previousCode: _ignored, ...body } = input
      return apiRequest<DictType>(`/dict-type/${id}`, {
        method: "PATCH",
        body,
      })
    },
    onSettled: (_data, _error, input) => {
      const tasks: Promise<unknown>[] = [
        queryClient.invalidateQueries({ queryKey: listKey }),
      ]
      // code 变更会牵连两个 items 列表缓存（旧 code 下的 items 归属切换）。
      // 这里简单粗暴把新旧 code 的 items 列表都 invalidate 掉。
      if (input.previousCode && input.code && input.previousCode !== input.code) {
        tasks.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.dictItems.list({ typeCode: input.previousCode }),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.dictItems.list({ typeCode: input.code }),
          }),
        )
      }
      return Promise.all(tasks)
    },
  })
}

export function useDeleteDictType() {
  const queryClient = useQueryClient()
  const listKey = queryKeys.dictTypes.lists()

  return useMutation({
    mutationFn: (input: DeleteDictTypeInput) =>
      apiRequest<{ ok: boolean }>(`/dict-type/${input.id}`, {
        method: "DELETE",
      }),
    onSettled: (_data, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.dictItems.list({ typeCode: input.code }),
        }),
      ]),
  })
}
