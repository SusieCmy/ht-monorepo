/**
 * 查询键（queryKey）工厂。
 *
 * 对应规则：
 * - qk-array-structure：所有 key 必须是数组。
 * - qk-hierarchical-organization：按“作用域 → 实体 → 变体 → 参数”分层。
 * - qk-include-dependencies：任何会影响结果的入参都要放进 key。
 * - qk-factory-pattern：集中管理，让失效（invalidate）操作具备类型安全。
 * - qk-serializable：key 里只能放可 JSON 序列化的值（字符串、数字、普通对象），
 *   禁止 Date / Map / 类实例 / 函数。
 *
 * 使用示例：
 *   useQuery({ queryKey: queryKeys.users.detail(userId), ... })
 *   queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
 *
 * 新增业务领域时：复制下面的 `users`，改名后扩展字段即可。
 * 把所有工厂集中在这一个文件里，日后用 `Ctrl+F "queryKeys."` 就能找到
 * 所有缓存消费方，排查“脏缓存”bug 非常方便。
 */

// 这几个类型必须 export —— 否则 options/*.ts 里 `queryOptions({ queryKey })`
// 的推断结果会引用到 SerializableObject，TS 在跨文件的导出签名里要求
// 名字能被直接命名（TS4058）。
export type SerializablePrimitive =
  | string
  | number
  | boolean
  | null
  | undefined
export type SerializableObject = {
  [key: string]: SerializablePrimitive | SerializableObject | SerializableArray
}
export type SerializableArray = ReadonlyArray<
  SerializablePrimitive | SerializableObject | SerializableArray
>
export type QueryKeyFilter = SerializableObject

/** {@link createEntityKeys} 产出的作用域工厂类型。 */
export interface EntityKeys<TId extends SerializablePrimitive = string> {
  /** 该实体下所有查询的根 key；失效它会级联清掉所有变体。 */
  all: readonly [string, string]
  /** 该实体的“列表类”查询的根 key。 */
  lists: () => readonly [string, string, "list"]
  /** 带筛选条件的某一份具体列表。 */
  list: (filters?: QueryKeyFilter) => readonly [
    string,
    string,
    "list",
    QueryKeyFilter,
  ]
  /** 该实体的“详情类”查询的根 key。 */
  details: () => readonly [string, string, "detail"]
  /** 某个具体 id 的详情。 */
  detail: (id: TId) => readonly [string, string, "detail", TId]
}

/**
 * 为某个作用域下的某个实体生成一套分层的 queryKey 工厂。
 *
 * 层级结构为 `[scope, entity, variant, params]`，因此只要调用
 * `invalidateQueries({ queryKey: keys.all })` 就会级联失效所有变体。
 */
export function createEntityKeys<TId extends SerializablePrimitive = string>(
  scope: string,
  entity: string,
): EntityKeys<TId> {
  const root = [scope, entity] as const
  return {
    all: root,
    lists: () => [...root, "list"] as const,
    list: (filters = {}) => [...root, "list", filters] as const,
    details: () => [...root, "detail"] as const,
    detail: (id) => [...root, "detail", id] as const,
  }
}

/**
 * 全局 queryKey 注册表。项目里每增加一个业务领域，就在这里加一行。
 *
 * 扩展示例：
 *   orders: createEntityKeys<number>("admin", "orders"),
 */
export const queryKeys = {
  users: createEntityKeys<string>("admin", "users"),
  // 动态表格配置：一条配置 = 一张可定制列的表（入库 / 出库 / 预警 …）。
  sheetConfigs: createEntityKeys<number>("sheets", "configs"),
  // 动态表格行数据：通过 list({ sheetId }) 拿某张表的全部行。
  sheetRows: createEntityKeys<number>("sheets", "rows"),
  // 字典类型：例如 product_type / warehouse / stock_status。
  dictTypes: createEntityKeys<string>("dict", "types"),
  // 字典项：通过 list({ typeCode }) 拿某个类型下的所有 items。
  dictItems: createEntityKeys<number>("dict", "items"),
  // 预警规则：按 list({ sheetId }) 拿某张表的所有商品阈值配置。
  alertRules: createEntityKeys<number>("alerts", "rules"),
  // 预警命中行：按 list({ sheetId, productColumnId, stockColumnId, defaultThreshold }) 拿命中行。
  alertHits: createEntityKeys<number>("alerts", "hits"),
} as const

export type QueryKeys = typeof queryKeys
