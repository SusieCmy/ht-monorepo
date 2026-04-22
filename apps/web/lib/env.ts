/**
 * 环境变量集中出口。
 *
 * 所有 `process.env.*` 的读取都要经过本文件，避免业务代码里散落字符串 key、
 * 或者把服务端才应该出现的变量误用到客户端 bundle 里。
 *
 * 约定：
 * - `NEXT_PUBLIC_*` 前缀的变量可在客户端读取。
 * - 其余变量只能在 Server Component / Server Action / Route Handler 里使用；
 *   如果需要在客户端也能访问，请改名加 `NEXT_PUBLIC_` 前缀。
 *
 * 真实项目可引入 `zod` 做运行期 schema 校验（在应用启动时 parse 一次）。
 * 例：
 *   const Schema = z.object({ NEXT_PUBLIC_API_BASE_URL: z.string().url() })
 *   export const env = Schema.parse(process.env)
 */

export const env = {
  /** 浏览器端 API 基址；未设置时 `apiRequest` 走同源相对路径。 */
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
} as const

export type Env = typeof env
