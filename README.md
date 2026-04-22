# hh-admin

基于 **Next.js 16 + React 19 + shadcn/ui** 的后台管理系统，采用 pnpm workspace + Turborepo 的 monorepo 架构。

> 阅读时序建议：先看本文件 → 拆目录结构看得到**在哪改** → 写代码前回看 `.cursor/rules/` 里的强约束。

---

## 技术栈

| 层 | 选择 | 版本 |
|---|---|---|
| 构建 / 工作区 | pnpm workspace + Turborepo | pnpm 9.15.9 / Turbo 2.8 |
| 前端框架 | Next.js App Router + Turbopack | 16.1 |
| 视图 | React + TypeScript（strict） | 19.2 / 5.9 |
| UI | shadcn/ui（`radix-nova`） + Tailwind CSS v4（CSS-first） | — |
| 底层 UI 原语 | radix-ui + class-variance-authority | — |
| 图标 | @tabler/icons-react | — |
| 主题 | next-themes | — |
| 数据层（服务端状态） | @tanstack/react-query v5（项目已封装） | 5.99 |
| 客户端状态 | zustand | 5.0 |
| 表单校验 | zod | 3.x |
| 代码风格 | Prettier（`semi: false` / 双引号 / 2 空格 / LF）+ ESLint | — |

环境要求：**Node ≥ 20**，包管理器必须是 `pnpm`。

---

## 快速启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动 web（Next.js dev server）
pnpm --filter web dev
# 或根目录启动所有 app
pnpm dev

# 3. 打开浏览器
# http://localhost:3000  → 会自动重定向到 /dashboard
```

常用脚本：

```bash
pnpm --filter web typecheck   # 只做类型检查
pnpm --filter web lint
pnpm build                    # 全量构建（走 turbo）
pnpm format                   # Prettier 格式化
```

---

## 目录结构

```
hh-admin/
├─ apps/
│  └─ web/                          # Next.js 业务应用
│     ├─ app/
│     │  ├─ (admin)/                # 后台路由组（有侧边栏）
│     │  │  ├─ layout.tsx           # SidebarProvider + AppSidebar + SidebarInset
│     │  │  └─ dashboard/page.tsx
│     │  ├─ (auth)/                 # 登录/注册路由组（无侧边栏）
│     │  │  ├─ layout.tsx
│     │  │  └─ login/page.tsx
│     │  ├─ layout.tsx              # 根：QueryProvider + ThemeProvider
│     │  └─ page.tsx                # 重定向 -> /dashboard
│     ├─ components/
│     │  ├─ providers/              # 所有 Provider（query / theme / error-boundary）
│     │  ├─ layout/                 # 全局布局件（AppSidebar...）
│     │  └─ common/                 # 跨模块复用的业务组件
│     ├─ features/                  # 按业务模块纵切
│     │  └─ <module>/{components,hooks,schemas}/
│     ├─ hooks/                     # 跨 feature 的通用 hooks
│     └─ lib/
│        ├─ query/                  # TanStack Query 封装（核心基建）
│        ├─ utils/                  # 纯函数工具
│        └─ env.ts                  # 集中 process.env 出口
└─ packages/
   ├─ ui/                           # @workspace/ui：通用 UI（shadcn 组件落这里）
   ├─ eslint-config/                # @workspace/eslint-config
   └─ typescript-config/            # @workspace/typescript-config
```

路径别名：

| 别名 | 指向 | 什么时候用 |
|---|---|---|
| `@/xxx` | `apps/web/xxx` | 应用内部导入 |
| `@workspace/ui/components/<name>` | `packages/ui/src/components/<name>.tsx` | 所有通用 UI 组件 |
| `@workspace/ui/lib/utils` | `packages/ui/src/lib/utils.ts` | `cn()` 等工具 |
| `@workspace/ui/hooks/<name>` | `packages/ui/src/hooks/<name>.ts` | 通用 hooks |

**禁止**跨包相对路径（`../../../packages/ui/...`）。

---

## 核心架构

### 1. 数据层（`apps/web/lib/query`）

完整封装了 TanStack Query v5，**业务代码永远走封装，不要直接 `fetch` / `new QueryClient()` / 内联 queryKey**。

```ts
import {
  apiRequest,
  getQueryClient,
  optimisticUpdate,
  options,
  PrefetchHydrate,
  prefetchOnServer,
  queryKeys,
} from "@/lib/query"
```

- `getQueryClient()` — 服务端每请求新建、浏览器端单例
- `queryKeys.*` — 分层工厂（`[scope, entity, variant, params]`）
- `options.<entity>.*Options(...)` — 查询配置工厂，`useQuery` / `useSuspenseQuery` / `prefetchQuery` 共用
- `apiRequest<T>(path, { signal, body })` — 统一 fetch，处理 204 / `ApiError` / 查询取消
- `optimisticUpdate({ queryKey, updater })` — 生成乐观更新的三段回调
- `PrefetchHydrate` / `prefetchOnServer` — Server Component 预取 + 流式水合

详见规则：`.cursor/rules/tanstack-query-usage.mdc`

### 2. 布局 / 路由组

- **`(admin)`** —— 所有需要侧边栏的后台页面，布局已接 `SidebarProvider`（cookie 持久化展开态）+ `TooltipProvider` + `SidebarInset`。
- **`(auth)`** —— 登录/注册/找回密码；布局只给一个居中卡片容器，不挂后台 Provider。
- **根 `/`** —— `redirect("/dashboard")`。后续接入鉴权后可改为未登录跳 `/login`。

### 3. 侧边栏菜单

`apps/web/components/layout/app-sidebar.tsx` 里的 `NAV_GROUPS` 数组是**单一数据源**，新增菜单改这里即可，支持数据驱动的分组、Tabler 图标、`usePathname` 前缀匹配激活态、`collapsible="icon"` 模式 + tooltip。

---

## 新增业务模块（标准 5 步）

以"用户管理"为例：

1. **注册 queryKey**：`apps/web/lib/query/keys.ts`
   ```ts
   export const queryKeys = {
     users: createEntityKeys<string>("admin", "users"),
   } as const
   ```

2. **写 queryOptions 工厂**：`apps/web/lib/query/options/users.ts`（已存在示例）
   ```ts
   export function userListOptions(params: UserListParams = {}) {
     return queryOptions({
       queryKey: queryKeys.users.list(filters),
       queryFn: ({ signal }) => apiRequest<UserListResponse>(`/api/admin/users?...`, { signal }),
       placeholderData: keepPreviousData,
     })
   }
   ```
   记得在 `options/index.ts` 里 `export * as users from "./users"`。

3. **定义 zod schema**：`apps/web/features/users/schemas/`
4. **写业务组件**：`apps/web/features/users/components/`
5. **建页面**：`apps/web/app/(admin)/users/page.tsx`
   ```tsx
   import { options, PrefetchHydrate } from "@/lib/query"
   export default async function UsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
     const { page } = await searchParams
     return (
       <PrefetchHydrate prefetch={(qc) => qc.prefetchQuery(options.users.userListOptions({ page: Number(page ?? 1) }))}>
         <UserTable />
       </PrefetchHydrate>
     )
   }
   ```

更多细节：`apps/web/features/README.md`。

---

## 添加 shadcn 组件

```bash
pnpm dlx shadcn@latest add <comp> -c apps/web
# 例：
pnpm dlx shadcn@latest add data-table -c apps/web
```

组件会**自动落位到 `packages/ui/src/components/`**。不要手动拷贝源码。

---

## AI 协作（Cursor Rules + MCP）

项目在 `.cursor/rules/` 下有两条**强约束规则**（`alwaysApply: true`），Cursor 每次会话自动注入：

| 规则 | 作用 |
|---|---|
| `project-conventions.mdc` | 整体开发规约：目录、命令、UI/TS/Prettier、业务分层、禁止清单 |
| `tanstack-query-usage.mdc` | 数据层使用细则：queryKeys、options 工厂、apiRequest、错误处理 |

### 强制 MCP / 技能使用场景

| 场景 | 必须走 |
|---|---|
| 任何 Next.js 相关问题 | `next-devtools` MCP 的 `nextjs_docs`，不要凭记忆答 |
| 对接后端接口 | `apifox`（API 文档）MCP 拉 OAS，不要猜字段名 |
| 新增 shadcn 组件 | `shadcn` MCP 搜 registry 再添加 |
| 编写数据请求 | 先读 `.cursor/skills/tanstack-query/SKILL.md` 再动键盘 |
| 创建 / 设计 Zustand store、用 zustand 做状态管理 | 先读 `~/.cursor/skills/zustand-best-practices/SKILL.md`（个人级 skill），触发词包含 "zustand store" / "创建 store" / "用 zustand 做状态管理" |

其它 MCP（GitLens 等）默认不主动使用，按需召唤。

> 注：`zustand-best-practices` 当前安装在**个人目录**（`~/.cursor/skills/`），仅本机可用。若团队约定统一风格，可把该目录迁移到仓库内 `.cursor/skills/zustand-best-practices/` 变为项目级共享。

---

## 禁止清单（最常见的坏味道）

- 用 `npm` / `yarn`（只能 `pnpm`）
- 改 `tailwind.config.*`（项目无此文件，改 `packages/ui/src/styles/globals.css` 的 CSS 变量）
- 在 `apps/web/components/ui/` 手写/拷贝 shadcn 组件
- 跨包相对路径 `../../../packages/ui/...`
- Client Component 里 `await fetch`（走 `useQuery` + `apiRequest`）
- Server Component 里用 `useState` / `useEffect` / 浏览器 API
- `useQuery` 上写 `onSuccess` / `onError`（v5 已移除，副作用用 `useEffect`）
- 业务代码里直接 `console.log` 不清理

---

## 常见问题

**Q: 为什么 `pnpm install` 后 `where npx` 找不到，但 `npx --version` 能跑？**
Windows PowerShell 老问题，不影响运行（Cursor / Node 内部都能正确找到）。

**Q: SSR 水合后为什么客户端又发了一次同样的请求？**
已在 `lib/query/client.ts` 里对服务端把 `staleTime` 调到 5 分钟避免这个问题。若某个查询仍需要差异化，改 `queryOptions` 层面的 `staleTime`，**不要动全局默认**。

**Q: 侧边栏 Ctrl+B 怎么切换？**
shadcn sidebar 默认快捷键就是 `Ctrl/Cmd + B`，状态写入 cookie（`sidebar_state`），刷新也不丢。

---

## License

Private — Internal use only.
