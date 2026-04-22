/**
 * 查询配置工厂（queryOptions factory）。
 *
 * 对应规则：
 * - qk-factory-pattern + pf-intent-prefetch：让 `useQuery`、`useSuspenseQuery`、
 *   `queryClient.prefetchQuery` 共用同一份 `queryKey + queryFn`，避免拼错 key
 *   导致的缓存未命中。
 * - perf-select-transform：如有数据转换逻辑，通过 `select` 在 hook 处再套一层，
 *   这里只保留纯粹的数据获取。
 *
 * 约定：
 * 1. 每个业务领域一个文件（users.ts / orders.ts / roles.ts …），与
 *    {@link queryKeys} 里的条目一一对应。
 * 2. 工厂函数以 `xxxOptions` 命名；所有影响结果的入参都要通过参数传入，
 *    并转写进 queryKey（遵守 qk-include-dependencies）。
 * 3. 列表类的 options 默认开启 `placeholderData: keepPreviousData`，让分页
 *    切换时不会短暂白屏（规则 cache-placeholder-vs-initial）。
 *
 * 用法示例：
 *
 *   // 组件里
 *   const { data } = useQuery(userListOptions({ page, pageSize }))
 *
 *   // Server Component 里
 *   <PrefetchHydrate
 *     prefetch={(qc) => qc.prefetchQuery(userListOptions({ page: 1 }))}
 *   >
 *     <UserTable />
 *   </PrefetchHydrate>
 *
 * 待对接真实后端时：把下面的 `User` / `UserListResponse` 替换成由后端
 * OpenAPI 生成的类型即可，调用点（queryKey、queryFn）保持不变。
 */

import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { queryKeys } from "../keys"
import { apiRequest } from "../request"

export interface User {
  id: string
  name: string
  email: string
  createdAt: string
}

export interface UserListParams {
  page?: number
  pageSize?: number
  keyword?: string
}

export interface UserListResponse {
  items: User[]
  total: number
}

export function userListOptions(params: UserListParams = {}) {
  const { page = 1, pageSize = 20, keyword } = params
  // 归一化后的 filters 会被写进 queryKey，保证同样的请求参数命中同一份缓存。
  const filters = { page, pageSize, keyword: keyword?.trim() || undefined }

  return queryOptions({
    queryKey: queryKeys.users.list(filters),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams()
      search.set("page", String(page))
      search.set("pageSize", String(pageSize))
      if (filters.keyword) search.set("keyword", filters.keyword)
      return apiRequest<UserListResponse>(`/api/admin/users?${search}`, {
        signal,
      })
    },
    // 分页切换时先沿用上一页数据，新请求完成后平滑替换。
    placeholderData: keepPreviousData,
  })
}

export function userDetailOptions(id: string) {
  return queryOptions({
    queryKey: queryKeys.users.detail(id),
    queryFn: ({ signal }) =>
      apiRequest<User>(`/api/admin/users/${encodeURIComponent(id)}`, {
        signal,
      }),
    // 详情是强实体，命中概率高，适当加长 staleTime 降低无意义刷新。
    staleTime: 5 * 60 * 1000,
    // 仅当 id 有值时才发起请求，组件里也不必自己写 `enabled`。
    enabled: Boolean(id),
  })
}
