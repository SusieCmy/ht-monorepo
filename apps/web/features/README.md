# features/

按业务模块纵切的组织层。

## 放什么

以"业务领域"为单位把一个模块内部的资源聚在一起：

```
features/
└─ <module>/
   ├─ components/   # 仅该模块使用的 UI 组件（例如 UserTable、UserForm）
   ├─ hooks/        # 仅该模块使用的 hooks（例如 useUserFilters）
   ├─ schemas/      # zod schema（表单校验、Server Action 入参校验）
   └─ services/     # 可选：对 lib/query/options 的 thin wrapper，或 Server Action
```

## 放什么 / 不放什么（速查）

| 类型 | 位置 |
|---|---|
| 该模块的 zod schema | `features/<module>/schemas/` |
| 该模块的业务组件 | `features/<module>/components/` |
| 跨模块复用的业务组件 | `apps/web/components/common/` |
| 通用 UI 组件 | `packages/ui/src/components/` |
| 查询 key / options 工厂 | `apps/web/lib/query/keys.ts` + `apps/web/lib/query/options/<module>.ts` |
| 页面入口（路由） | `apps/web/app/(admin)/<module>/page.tsx` |
| 仅单个路由使用的组件 | `apps/web/app/(admin)/<module>/_components/`（下划线前缀，Next.js 不当作路由） |

## 命名与导入约定

- 模块目录用**单数或复数看业务习惯**，与 `queryKeys` 里的 entity 名保持一致（例：`features/users` ↔ `queryKeys.users`）。
- 导入走 `@/features/users/...`，禁止跨 feature 相对路径。
- 不要在 `features/<module>/components/` 里放能被其它模块复用的组件——一旦发现第二处引用，立即提升到 `apps/web/components/common/`。

## 新建一个模块的标准姿势

1. `apps/web/lib/query/keys.ts` 注册 `queryKeys.<module>`。
2. `apps/web/lib/query/options/<module>.ts` 写 `queryOptions` 工厂，并在 `options/index.ts` 导出。
3. `features/<module>/schemas/` 写 zod schema。
4. `features/<module>/components/` 写业务组件。
5. `app/(admin)/<module>/page.tsx` 做 Server Component 预取 + 嵌入业务组件。
