/**
 * 字典项（dict_item）的 CRUD mutations，按 typeCode 作用域。
 *
 * 对应后端：
 *   POST   /dict-item
 *   PATCH  /dict-item/:id
 *   DELETE /dict-item/:id
 *
 * 每个 hook 绑定一个 typeCode，方便缓存键定位到具体某一份 items 列表，
 * 并对当前作用域做乐观更新，避免其它字典类型的列表受影响。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiRequest, queryKeys } from "@/lib/query"
import type { DictItem } from "@/lib/query/options/dicts"

export interface CreateDictItemInput {
  value: string
  label: string
  sortOrder?: number
}

export interface UpdateDictItemInput {
  id: number
  value?: string
  label?: string
  sortOrder?: number
}

export interface DeleteDictItemInput {
  id: number
}

type ItemListKey = ReturnType<typeof queryKeys.dictItems.list>

/** 按 sort_order、id 升序排序一份 items 列表；用于乐观更新后的稳定渲染。 */
function sortItems(items: DictItem[]): DictItem[] {
  return [...items].sort((a, b) => {
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    if (so !== 0) return so
    return a.id - b.id
  })
}

export function useCreateDictItem(typeCode: string) {
  const queryClient = useQueryClient()
  const listKey: ItemListKey = queryKeys.dictItems.list({ typeCode })

  return useMutation({
    mutationFn: (input: CreateDictItemInput) =>
      apiRequest<DictItem>("/dict-item", {
        method: "POST",
        body: { typeCode, ...input },
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<DictItem[]>(listKey)
      const tempId = -Date.now()
      const optimistic: DictItem = {
        id: tempId,
        typeCode,
        value: input.value,
        label: input.label,
        sortOrder: input.sortOrder ?? 0,
      }
      queryClient.setQueryData<DictItem[]>(listKey, (current) =>
        sortItems([...(current ?? []), optimistic]),
      )
      return { previous, tempId }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(listKey, ctx.previous)
      }
    },
    onSuccess: (created, _v, ctx) => {
      queryClient.setQueryData<DictItem[]>(listKey, (current) => {
        if (!current) return [created]
        return sortItems(
          current.map((it) => (it.id === ctx?.tempId ? created : it)),
        )
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })
}

export function useUpdateDictItem(typeCode: string) {
  const queryClient = useQueryClient()
  const listKey: ItemListKey = queryKeys.dictItems.list({ typeCode })

  return useMutation({
    mutationFn: (input: UpdateDictItemInput) => {
      const { id, ...body } = input
      return apiRequest<DictItem>(`/dict-item/${id}`, {
        method: "PATCH",
        body,
      })
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<DictItem[]>(listKey)
      queryClient.setQueryData<DictItem[]>(listKey, (current) => {
        if (!current) return current
        const next = current.map((it) =>
          it.id === input.id
            ? {
                ...it,
                ...(input.value !== undefined ? { value: input.value } : {}),
                ...(input.label !== undefined ? { label: input.label } : {}),
                ...(input.sortOrder !== undefined
                  ? { sortOrder: input.sortOrder }
                  : {}),
              }
            : it,
        )
        return sortItems(next)
      })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(listKey, ctx.previous)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })
}

export function useDeleteDictItem(typeCode: string) {
  const queryClient = useQueryClient()
  const listKey: ItemListKey = queryKeys.dictItems.list({ typeCode })

  return useMutation({
    mutationFn: (input: DeleteDictItemInput) =>
      apiRequest<{ ok: boolean }>(`/dict-item/${input.id}`, {
        method: "DELETE",
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<DictItem[]>(listKey)
      queryClient.setQueryData<DictItem[]>(listKey, (current) =>
        current?.filter((it) => it.id !== input.id),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(listKey, ctx.previous)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })
}
