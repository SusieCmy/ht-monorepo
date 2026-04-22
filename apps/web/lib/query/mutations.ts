import type { QueryClient, QueryKey } from "@tanstack/react-query"

/**
 * 乐观更新的通用辅助函数。
 *
 * 对应规则：
 * - mut-optimistic-updates：服务端响应之前先把缓存改成“成功后的样子”。
 * - mut-rollback-context：`onMutate` 必须把旧值快照返回，`onError` 才能回滚。
 * - mut-invalidate-queries：无论成败，`onSettled` 都重新拉取一次，确保和
 *   服务端计算出来的字段（时间戳、关联数据等）对齐。
 */

export interface OptimisticContext<TSnapshot> {
  /** 变更前的缓存快照，`onError` 用它回滚 */
  previous: TSnapshot | undefined
}

interface OptimisticConfig<TData, TVariables> {
  /** 当前 QueryClient，通常来自 useQueryClient() */
  queryClient: QueryClient
  /** 要乐观更新的目标 queryKey */
  queryKey: QueryKey
  /** 根据旧缓存值 + 变更入参，计算出新缓存值 */
  updater: (previous: TData | undefined, variables: TVariables) => TData
}

/**
 * 生成 `useMutation` 所需的 `onMutate` / `onError` / `onSettled` 三件套。
 *
 * 使用示例：
 *   const mutation = useMutation({
 *     mutationFn: updateUser,
 *     ...optimisticUpdate({
 *       queryClient,
 *       queryKey: queryKeys.users.detail(id),
 *       updater: (prev, vars) => ({ ...prev!, ...vars }),
 *     }),
 *   })
 */
export function optimisticUpdate<TData, TVariables>({
  queryClient,
  queryKey,
  updater,
}: OptimisticConfig<TData, TVariables>) {
  return {
    onMutate: async (
      variables: TVariables,
    ): Promise<OptimisticContext<TData>> => {
      // 先取消该 key 上的在途请求，防止它 resolve 后覆盖掉我们的乐观值
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TData>(queryKey)
      queryClient.setQueryData<TData>(queryKey, (current) =>
        updater(current, variables),
      )
      return { previous }
    },
    onError: (
      _error: unknown,
      _variables: TVariables,
      context: OptimisticContext<TData> | undefined,
    ) => {
      // 出错时用 onMutate 保存的快照恢复
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: () => {
      // 无论成功失败，最后再拉一次确保和服务端一致
      return queryClient.invalidateQueries({ queryKey })
    },
  }
}
