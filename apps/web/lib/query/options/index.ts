/**
 * 所有 queryOptions 工厂的聚合出口。
 *
 * 业务代码统一从 `@/lib/query` 的 `options` 命名空间引用，例如：
 *
 *   import { options } from "@/lib/query"
 *   useQuery(options.users.listOptions({ page: 1 }))
 *
 * 新增业务领域时：
 *   1. 新建 `options/<entity>.ts`；
 *   2. 在 `keys.ts` 的 `queryKeys` 里注册对应 key；
 *   3. 在本文件里 `export * as <entity> from "./<entity>"`。
 */

export * as users from "./users"
export * as sheetConfigs from "./sheet-configs"
export * as sheetRows from "./sheet-rows"
export * as dicts from "./dicts"
