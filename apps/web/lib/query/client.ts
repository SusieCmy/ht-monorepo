import {
  QueryClient,
  defaultShouldDehydrateQuery,
  environmentManager,
} from "@tanstack/react-query"

/**
 * 构造 QueryClient 的全局默认配置。
 *
 * 对应规则：cache-defaults、cache-stale-time、cache-gc-time、err-retry-config、
 * network-mode、ssr-stale-time-server、ssr-client-per-request。
 *
 * 这里设置的是“全局兜底值”。如果某个页面需要不同行为（比如实时数据要
 * staleTime=0），优先通过 `queryOptions({ staleTime, gcTime })` 在该查询上
 * 单独覆盖，不要修改这里的全局默认。
 */
function makeQueryClient() {
  // ssr-stale-time-server：服务端的 staleTime 拉长，避免“水合完立刻客户端
  // 又发起一次相同请求”的假刷新；客户端侧仍维持 60s 基线，让用户感知到
  // 相对新鲜的数据。
  const staleTime = environmentManager.isServer() ? 5 * 60 * 1000 : 60 * 1000

  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime,
        // 非活跃查询在缓存中保留 5 分钟，浏览器前进/后退时能秒开。
        gcTime: 5 * 60 * 1000,
        // 4xx 属于业务/参数错误，重试没意义；5xx 或网络错误最多重试 2 次，
        // 间隔采用指数退避，上限 30s，避免雪崩。
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status
          if (typeof status === "number" && status >= 400 && status < 500) {
            return false
          }
          return failureCount < 2
        },
        retryDelay: (attemptIndex) =>
          Math.min(1000 * 2 ** attemptIndex, 30_000),
        // 后台管理系统数据通常变动不频繁，窗口聚焦触发 refetch 会让列表
        // 反复闪动，影响体验。如果某些实时性强的页面（监控面板、消息列表）
        // 需要，可在 `queryOptions({ refetchOnWindowFocus: true })` 里单独开。
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // 默认仅在联网时请求；如果要做离线优先的 PWA，把这里改成
        // "offlineFirst"（参考规则 network-mode）。
        networkMode: "online",
      },
      mutations: {
        // 变更操作默认不自动重试，避免重复提交（比如创建订单）。
        retry: false,
        networkMode: "online",
      },
      dehydrate: {
        // Next.js App Router 的流式 SSR：把服务端尚未 resolve 的 query
        // 也一并脱水传到客户端，客户端继续等待而不是重新发起请求。
        // 对应规则 ssr-dehydration。
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
        // 生产环境遵循 v5 默认行为（true），把服务端错误替换成占位错误，
        // 防止把数据库字段、内部堆栈或第三方服务地址经由脱水 payload
        // 暴露给浏览器。开发环境保留原始错误，方便定位 SSR 报错现场。
        shouldRedactErrors: () => process.env.NODE_ENV === "production",
      },
    },
  })
}

/** 浏览器端的 QueryClient 单例；服务端每次请求都会新建，不会走到这里。 */
let browserQueryClient: QueryClient | undefined

/**
 * 获取当前环境下可用的 QueryClient。
 *
 * - 服务端（SSR）：每次请求都返回新实例，防止跨请求泄露用户数据
 *   （对应规则 ssr-client-per-request）。
 * - 浏览器端：返回全局唯一单例，保证 React StrictMode 双渲染或 Suspense
 *   重试时都能命中同一份缓存。
 */
export function getQueryClient(): QueryClient {
  // v5.99+ 起 `isServer` 常量已废弃，官方推荐用 environmentManager.isServer()，
  // 好处是测试里可以通过 environmentManager.setIsServer(...) 做覆盖。
  if (environmentManager.isServer()) {
    return makeQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}
