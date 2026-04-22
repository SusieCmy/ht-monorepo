import { redirect } from "next/navigation"

/**
 * 根路由统一重定向到后台仪表盘。
 *
 * 接入真实认证后：这里可替换为 `redirect(isLoggedIn ? "/dashboard" : "/login")`，
 * 或直接交给 middleware.ts 做未登录拦截。
 */
export default function RootPage() {
  redirect("/dashboard")
}
