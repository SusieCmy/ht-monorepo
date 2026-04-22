import { cookies } from "next/headers"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { AppSidebar } from "@/components/layout/app-sidebar"

/**
 * 后台路由组布局。所有 `app/(admin)/**` 下的页面都会套这一层。
 *
 * - 从 cookie 读取 `sidebar_state` 作为初始展开/折叠值，避免 SSR 闪烁。
 * - `TooltipProvider` 必须外挂，`SidebarMenuButton` 的 `tooltip` 才能工作。
 * - `SidebarInset` 负责承载页面主内容区（含 sticky 顶栏）。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const sidebarState = cookieStore.get("sidebar_state")?.value
  const defaultOpen = sidebarState ? sidebarState === "true" : true

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm font-medium text-muted-foreground">
              管理后台
            </span>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
