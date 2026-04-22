export { getQueryClient } from "./client"
export { queryKeys, createEntityKeys } from "./keys"
export type { EntityKeys, QueryKeys, QueryKeyFilter } from "./keys"
export { apiRequest } from "./request"
export type { ApiError } from "./request"
export { optimisticUpdate } from "./mutations"
export type { OptimisticContext } from "./mutations"
export { PrefetchHydrate, prefetchOnServer } from "./hydration"

// 各业务领域的 queryOptions 工厂，统一从 `options` 命名空间访问：
//   import { options } from "@/lib/query"
//   useQuery(options.users.userListOptions({ page: 1 }))
export * as options from "./options"
