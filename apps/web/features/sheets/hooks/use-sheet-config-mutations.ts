/**
 * 动态表格列配置的 mutations：改列名 / 添加列 / 删除列。
 *
 * 对应后端接口（iaxixi 项目 / Apifox）：
 *   PATCH  /sheet-config/{id}    更新单张表的列定义
 *
 * 设计约束：
 *  - 所有 mutation 都接受"完整下一版 columns"作为入参，mutationFn 里不再
 *    从 queryClient 读缓存。避免"onMutate 乐观写入 → mutationFn 读缓存"
 *    的串扰 bug（之前添加一列会被提交两次）。
 *  - 组件层负责按当前真实 columns 计算出 nextColumns，然后调用这里的 helper；
 *    helper 内部完成乐观更新 + PATCH + 回滚。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiRequest, queryKeys } from "@/lib/query"
import type {
  SheetColumn,
  SheetConfig,
} from "@/lib/query/options/sheet-configs"

interface PatchColumnsInput {
  /** 完整的下一版列数组；后端会整体替换 `sheet_config.columns`。 */
  columns: SheetColumn[]
}

/**
 * 通用底层 mutation：发 PATCH `/sheet-config/{id}` 并做乐观更新。
 * 外部调用不要直接用它，请用下面三个语义化 helper。
 */
function usePatchSheetColumns(sheetConfigId: number) {
  const queryClient = useQueryClient()
  const detailKey = queryKeys.sheetConfigs.detail(sheetConfigId)
  const rowListKey = queryKeys.sheetRows.list({ sheetId: sheetConfigId })

  return useMutation({
    mutationFn: (input: PatchColumnsInput) =>
      apiRequest<SheetConfig>(`/sheet-config/${sheetConfigId}`, {
        method: "PATCH",
        body: { columns: input.columns },
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previous = queryClient.getQueryData<SheetConfig>(detailKey)
      queryClient.setQueryData<SheetConfig>(detailKey, (current) =>
        current ? { ...current, columns: input.columns } : current,
      )
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(detailKey, context.previous)
      }
    },
    onSuccess: (saved) => {
      // 用后端返回的真实 config 覆盖缓存：后端可能把 order/id 规范化或
      // 给新列分配真正的 col id，这里统一以服务端为准。
      queryClient.setQueryData(detailKey, saved)
    },
    onSettled: () => {
      // 列变更可能会影响行数据（例如删列时后端级联清了 rows.data 对应 key），
      // 两份缓存一起 invalidate。
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({ queryKey: rowListKey }),
      ])
    },
  })
}

/** 读一次当前缓存中的 columns 作为"算 nextColumns"的基准。 */
function useCurrentColumns(sheetConfigId: number) {
  const queryClient = useQueryClient()
  return () => {
    const current = queryClient.getQueryData<SheetConfig>(
      queryKeys.sheetConfigs.detail(sheetConfigId),
    )
    if (!current) {
      throw new Error("sheet-config 缓存未就绪，请先等待详情加载完成")
    }
    return current.columns
  }
}

interface RenameInput {
  columnId: string
  nextName: string
}

/** 重命名某一列（按 id 匹配）。 */
export function useRenameSheetColumn(sheetConfigId: number) {
  const patch = usePatchSheetColumns(sheetConfigId)
  const getColumns = useCurrentColumns(sheetConfigId)

  return {
    ...patch,
    mutate: (input: RenameInput, options?: Parameters<typeof patch.mutate>[1]) => {
      const nextColumns = getColumns().map((col) =>
        col.id === input.columnId ? { ...col, name: input.nextName } : col,
      )
      return patch.mutate({ columns: nextColumns }, options)
    },
    mutateAsync: (
      input: RenameInput,
      options?: Parameters<typeof patch.mutateAsync>[1],
    ) => {
      const nextColumns = getColumns().map((col) =>
        col.id === input.columnId ? { ...col, name: input.nextName } : col,
      )
      return patch.mutateAsync({ columns: nextColumns }, options)
    },
  }
}

interface AppendInput {
  name: string
  type?: SheetColumn["type"]
  /** 仅当 type === 'dict' 时需要传：引用的字典类型 code（dict_type.code）。 */
  dictTypeCode?: string
}

/** 追加一列到末尾。 */
export function useAppendSheetColumn(sheetConfigId: number) {
  const patch = usePatchSheetColumns(sheetConfigId)
  const getColumns = useCurrentColumns(sheetConfigId)

  const buildNext = (input: AppendInput): SheetColumn[] => {
    const columns = getColumns()
    const maxOrder = columns.reduce(
      (acc, col) => Math.max(acc, col.order ?? 0),
      0,
    )
    const newCol: SheetColumn = {
      id: `col_${Date.now()}`,
      name: input.name,
      type: input.type ?? "text",
      order: maxOrder + 1,
      ...(input.type === "dict" && input.dictTypeCode
        ? { dictTypeCode: input.dictTypeCode }
        : {}),
    }
    return [...columns, newCol]
  }

  return {
    ...patch,
    mutate: (input: AppendInput, options?: Parameters<typeof patch.mutate>[1]) =>
      patch.mutate({ columns: buildNext(input) }, options),
    mutateAsync: (
      input: AppendInput,
      options?: Parameters<typeof patch.mutateAsync>[1],
    ) => patch.mutateAsync({ columns: buildNext(input) }, options),
  }
}

interface DeleteInput {
  columnId: string
}

/** 删除某一列（按 id 过滤）。后端会级联清理行 data 里对应 key。 */
export function useDeleteSheetColumn(sheetConfigId: number) {
  const patch = usePatchSheetColumns(sheetConfigId)
  const getColumns = useCurrentColumns(sheetConfigId)

  return {
    ...patch,
    mutate: (input: DeleteInput, options?: Parameters<typeof patch.mutate>[1]) => {
      const nextColumns = getColumns().filter((col) => col.id !== input.columnId)
      return patch.mutate({ columns: nextColumns }, options)
    },
    mutateAsync: (
      input: DeleteInput,
      options?: Parameters<typeof patch.mutateAsync>[1],
    ) => {
      const nextColumns = getColumns().filter((col) => col.id !== input.columnId)
      return patch.mutateAsync({ columns: nextColumns }, options)
    },
  }
}
