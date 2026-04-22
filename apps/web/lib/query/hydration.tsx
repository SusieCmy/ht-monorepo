import {
  HydrationBoundary,
  dehydrate,
  type FetchQueryOptions,
  type QueryClient,
} from "@tanstack/react-query"
import type { ReactNode } from "react"

import { getQueryClient } from "./client"

/**
 * 在服务端预取查询并把缓存交给客户端子树。
 *
 * 对应规则：ssr-dehydration、ssr-hydration-boundary。
 *
 * 使用示例（放在 Server Component / page.tsx 里）：
 *
 *   export default async function Page() {
 *     return (
 *       <PrefetchHydrate
 *         prefetch={async (qc) => {
 *           await qc.prefetchQuery(userListOptions())
 *         }}
 *       >
 *         <UserList />
 *       </PrefetchHydrate>
 *     )
 *   }
 *
 * 如果只是想预取单个 query，可以直接用下面的 {@link prefetchOnServer}。
 */
export async function PrefetchHydrate({
  children,
  prefetch,
}: {
  children: ReactNode
  prefetch: (queryClient: QueryClient) => Promise<unknown>
}) {
  const queryClient = getQueryClient()
  await prefetch(queryClient)
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  )
}

/**
 * 仅服务端使用：预取单个 query 并返回脱水状态，让调用方自己挂
 * `<HydrationBoundary state={...}>`。
 *
 * 通常配合 `queryOptions()` 使用，服务端和客户端复用同一份配置，
 * 对应规则 pf-ensure-query-data。
 */
export async function prefetchOnServer<TQueryFnData>(
  options: FetchQueryOptions<TQueryFnData>,
) {
  const queryClient = getQueryClient()
  await queryClient.prefetchQuery(options)
  return dehydrate(queryClient)
}
