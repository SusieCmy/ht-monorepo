/**
 * 极简 fetch 封装。
 *
 * 对应规则 query-cancellation：把 TanStack Query 传入的 `signal` 透传给
 * fetch，组件卸载、路由切换或 queryKey 变更时就能直接取消请求，避免竞态。
 *
 * 当前只做最薄一层，如果后续引入 axios / ky / openapi-fetch 来统一鉴权、
 * 拦截器等，请保留 `signal` 参数的透传，query-cancellation 规则就不会失效。
 */

export interface ApiError extends Error {
  /** HTTP 状态码 */
  status: number
  /** 后端返回的原始 body，方便上层读取业务错误码 */
  payload?: unknown
}

interface RequestOptions extends Omit<RequestInit, "body" | "signal"> {
  /** 请求体；非 undefined 时自动 JSON 序列化并带上 Content-Type */
  body?: unknown
  /** TanStack Query 提供的 AbortSignal，必须透传以支持取消 */
  signal?: AbortSignal
  /**
   * 单次调用级别的 baseUrl 覆盖；默认读 `NEXT_PUBLIC_API_BASE_URL`，
   * 未配置时走同源相对路径。
   */
  baseUrl?: string
}

/**
 * 统一计算 baseUrl：
 *  - 浏览器端：优先用 `NEXT_PUBLIC_API_BASE_URL`（项目里通常是 `/api`，
 *    由 next.config.mjs 的 rewrites 反代到真实后端，避免 CORS）。
 *  - 服务端（RSC / Route Handler / SSR 预取）：Node 的 fetch 不支持相对路径，
 *    这里改用 `NEXT_PUBLIC_API_ORIGIN`（后端真实地址）直连，省去一次 rewrite
 *    兜圈子。
 *  - 调用点若显式传 `baseUrl`，则一切以它为准。
 */
function resolveBaseUrl(override?: string) {
  if (override) return override.replace(/\/$/, "")
  const isServer = typeof window === "undefined"
  if (isServer) {
    const origin = process.env.NEXT_PUBLIC_API_ORIGIN
    if (origin) return origin.replace(/\/$/, "")
  }
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL
  return envBase ? envBase.replace(/\/$/, "") : ""
}

/**
 * 判断响应是否“无 body”。
 *
 * 这些状态码按 RFC 7230/9110 不允许/不应携带响应体，贸然 `response.json()`
 * 会抛 `SyntaxError: Unexpected end of JSON input`；所以在解析之前直接短路，
 * 让调用方拿到 `undefined`（TData 可显式声明为 void）。
 */
function isEmptyBodyResponse(response: Response): boolean {
  if (response.status === 204 || response.status === 205) return true
  // 有些后端把 DELETE 约定成 200 + 空 body，这里再兜底判断 Content-Length。
  const contentLength = response.headers.get("content-length")
  if (contentLength === "0") return true
  return false
}

export async function apiRequest<TData = unknown>(
  path: string,
  { body, headers, baseUrl, ...init }: RequestOptions = {},
): Promise<TData> {
  const url = `${resolveBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      // 只有在传了 body 时才附带 Content-Type，避免污染 GET 请求
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // 204/205/Content-Length: 0 —— 没有响应体，直接按 void 返回。
  // 对应规则 err-error-boundaries：上层 useMutation/useQuery 不会因为
  // 解析空 body 失败而误判为“网络错误”。
  if (isEmptyBodyResponse(response)) {
    if (!response.ok) {
      const error = new Error(`请求失败，HTTP ${response.status}`) as ApiError
      error.status = response.status
      throw error
    }
    return undefined as TData
  }

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json")
  const payload = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    // 统一把非 2xx 当作抛错，让 react-query 的 error 状态和错误边界生效
    const error = new Error(
      (isJson && (payload as { message?: string })?.message) ||
        `请求失败，HTTP ${response.status}`,
    ) as ApiError
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload as TData
}
