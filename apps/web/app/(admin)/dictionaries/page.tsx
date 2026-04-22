const DICT_TYPES: {
  code: string
  name: string
  itemCount: number
  updatedAt: string
}[] = [
  { code: "order_status", name: "订单状态", itemCount: 6, updatedAt: "2026-04-18" },
  { code: "pay_method", name: "支付方式", itemCount: 4, updatedAt: "2026-04-10" },
  { code: "gender", name: "性别", itemCount: 3, updatedAt: "2025-12-02" },
  { code: "warehouse_zone", name: "仓库区域", itemCount: 12, updatedAt: "2026-04-22" },
  { code: "alert_level", name: "预警等级", itemCount: 3, updatedAt: "2026-04-20" },
]

const DICT_ITEMS: {
  label: string
  value: string
  sort: number
  enabled: boolean
}[] = [
  { label: "待付款", value: "PENDING", sort: 1, enabled: true },
  { label: "已付款", value: "PAID", sort: 2, enabled: true },
  { label: "已发货", value: "SHIPPED", sort: 3, enabled: true },
  { label: "已完成", value: "COMPLETED", sort: 4, enabled: true },
  { label: "已取消", value: "CANCELLED", sort: 5, enabled: true },
  { label: "已退款", value: "REFUNDED", sort: 6, enabled: false },
]

export default function DictionariesPage() {
  const totalTypes = DICT_TYPES.length
  const totalItems = DICT_TYPES.reduce((sum, t) => sum + t.itemCount, 0)
  const disabledItems = DICT_ITEMS.filter((i) => !i.enabled).length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">字典管理</h1>
        <p className="text-muted-foreground text-sm">
          维护系统枚举值（订单状态、支付方式等），供业务模块下拉选项、校验规则统一引用。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "字典类型", value: totalTypes, hint: "个" },
          { title: "字典项", value: totalItems, hint: "条" },
          { title: "已禁用项", value: disabledItems, hint: "不再下发" },
        ].map((card) => (
          <div
            key={card.title}
            className="bg-card rounded-lg border p-4 shadow-sm"
          >
            <div className="text-muted-foreground text-sm">{card.title}</div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
            <div className="text-muted-foreground mt-1 text-xs">{card.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-medium">字典类型</span>
            <span className="text-muted-foreground text-xs">
              {DICT_TYPES.length} 项
            </span>
          </div>
          <ul className="divide-y">
            {DICT_TYPES.map((type, idx) => (
              <li
                key={type.code}
                className={`flex items-center justify-between px-4 py-3 text-sm ${
                  idx === 0 ? "bg-accent/60" : "hover:bg-accent/30"
                } cursor-pointer`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{type.name}</div>
                  <div className="text-muted-foreground mt-0.5 font-mono text-xs">
                    {type.code}
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {type.itemCount} 项
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-card rounded-lg border shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <span className="text-sm font-medium">订单状态</span>
              <span className="text-muted-foreground ml-2 font-mono text-xs">
                order_status
              </span>
            </div>
            <button
              type="button"
              className="border-border hover:bg-accent rounded-md border px-2.5 py-1 text-xs transition-colors"
            >
              新增字典项
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">排序</th>
                  <th className="px-4 py-2 font-medium">标签</th>
                  <th className="px-4 py-2 font-medium">值</th>
                  <th className="px-4 py-2 font-medium">状态</th>
                  <th className="px-4 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {DICT_ITEMS.map((item) => (
                  <tr key={item.value}>
                    <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                      {item.sort}
                    </td>
                    <td className="px-4 py-2">{item.label}</td>
                    <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                      {item.value}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          item.enabled
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-400/30"
                            : "bg-muted text-muted-foreground ring-border"
                        }`}
                      >
                        <span
                          className={`inline-block size-1.5 rounded-full ${item.enabled ? "bg-emerald-500" : "bg-muted-foreground"}`}
                        />
                        {item.enabled ? "启用" : "禁用"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground mr-3 text-xs transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive text-xs transition-colors"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
