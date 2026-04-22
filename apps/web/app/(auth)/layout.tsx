/**
 * 认证路由组布局：登录 / 注册 / 找回密码等不需要后台侧边栏的页面。
 *
 * 仅提供居中容器。真实样式可以按品牌重写，但约定是：
 * `app/(auth)/**` 下的页面**不应**依赖后台 Provider（Sidebar 之类）。
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
