"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import type { ReactNode } from "react"

import { getQueryClient } from "@/lib/query"

import { QueryErrorBoundary } from "./query-error-boundary"

// Devtools 会附带自己的一整棵 React 树，仅在开发环境动态加载，
// 避免打包进生产产物。
const ReactQueryDevtools =
  process.env.NODE_ENV === "production"
    ? () => null
    : dynamic(
        () =>
          import("@tanstack/react-query-devtools").then(
            (mod) => mod.ReactQueryDevtools,
          ),
        { ssr: false },
      )

export function QueryProvider({ children }: { children: ReactNode }) {
  // 注意：getQueryClient 每次渲染都会调用，但这是一次廉价的单例查找：
  // 浏览器端返回同一份 QueryClient，服务端按请求各自新建
  // （对应规则 ssr-client-per-request）。
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      {/* 全局错误边界：配合 useQuery({ throwOnError: true }) 使用，
          所有未被 useQuery/useMutation 本地捕获的错误都会在这里兜底渲染。 */}
      <QueryErrorBoundary>{children}</QueryErrorBoundary>
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  )
}
