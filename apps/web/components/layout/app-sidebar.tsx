"use client"

/**
 * 后台管理侧边栏。
 *
 * 使用约定（遵循 project-conventions 规则）：
 * - 通用 UI 组件来自 `@workspace/ui`，应用级组件放 `apps/web/components`。
 * - 图标统一使用 `@tabler/icons-react`。
 * - 菜单项通过下方 `NAV_GROUPS` 数据驱动；新增条目只改这里即可。
 * - 激活态按 `usePathname` 的前缀匹配判断，便于子路由也保持高亮。
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconAlertTriangle,
  IconBook2,
  IconDashboard,
  IconKey,
  IconLogout,
  IconPackageExport,
  IconPackageImport,
  IconSettings,
  IconShieldLock,
  IconSparkles,
  IconUserCircle,
  IconUsers,
  type Icon,
} from "@tabler/icons-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

type NavItem = {
  title: string
  href: string
  icon: Icon
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "概览",
    items: [
      { title: "仪表盘", href: "/dashboard", icon: IconDashboard },
    ],
  },
  {
    label: "仓储管理",
    items: [
      { title: "入库管理", href: "/inbound", icon: IconPackageImport },
      { title: "出库管理", href: "/outbound", icon: IconPackageExport },
      { title: "预警", href: "/alerts", icon: IconAlertTriangle },
    ],
  },
  {
    label: "权限管理",
    items: [
      { title: "用户", href: "/users", icon: IconUsers },
      { title: "角色", href: "/roles", icon: IconShieldLock },
      { title: "权限", href: "/permissions", icon: IconKey },
    ],
  },
  {
    label: "系统",
    items: [
      { title: "字典管理", href: "/dictionaries", icon: IconBook2 },
      { title: "系统设置", href: "/settings", icon: IconSettings },
    ],
  },
]

function isActive(pathname: string, href: string) {
  // `/dashboard` 与 `/dashboard/...` 都视为命中；根路径 `/` 需要精确匹配，
  // 避免所有页面都把根项目当成激活态。
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <IconSparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">hh-admin</span>
                  <span className="truncate text-xs text-muted-foreground">
                    管理控制台
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={isActive(pathname, item.href)}
                      >
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="当前用户">
              <IconUserCircle />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Admin</span>
                <span className="truncate text-xs text-muted-foreground">
                  admin@hh.local
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="退出登录">
              <IconLogout />
              <span>退出登录</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
