type AlertLevel = "critical" | "warning" | "info"
type AlertCategory = "inventory" | "outbound" | "inbound"

const LEVEL_STYLES: Record<
  AlertLevel,
  { label: string; badge: string; dot: string }
> = {
  critical: {
    label: "严重",
    badge: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-400 dark:ring-red-400/30",
    dot: "bg-red-500",
  },
  warning: {
    label: "警告",
    badge: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-400/30",
    dot: "bg-amber-500",
  },
  info: {
    label: "提示",
    badge: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-400 dark:ring-sky-400/30",
    dot: "bg-sky-500",
  },
}

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  inventory: "库存",
  outbound: "出库",
  inbound: "入库",
}

const MOCK_ALERTS: {
  id: string
  level: AlertLevel
  category: AlertCategory
  rule: string
  target: string
  targetLabel: string
  currentValue: string
  threshold: string
  duration: string
}[] = [
  {
    id: "al-001",
    level: "critical",
    category: "inventory",
    rule: "库存低于安全阈值",
    target: "SKU-20481",
    targetLabel: "运动鞋 男款 42 码",
    currentValue: "3 件",
    threshold: "≥ 20 件",
    duration: "12 分钟",
  },
  {
    id: "al-002",
    level: "critical",
    category: "inventory",
    rule: "零库存",
    target: "SKU-11203",
    targetLabel: "保温杯 500ml",
    currentValue: "0 件",
    threshold: "> 0 件",
    duration: "2 小时",
  },
  {
    id: "al-003",
    level: "warning",
    category: "outbound",
    rule: "超时未发货",
    target: "OT-20260422-018",
    targetLabel: "出库单",
    currentValue: "26 小时",
    threshold: "≤ 24 小时",
    duration: "2 小时",
  },
  {
    id: "al-004",
    level: "warning",
    category: "outbound",
    rule: "超时未发货",
    target: "OT-20260422-021",
    targetLabel: "出库单",
    currentValue: "30 小时",
    threshold: "≤ 24 小时",
    duration: "6 小时",
  },
  {
    id: "al-005",
    level: "warning",
    category: "inbound",
    rule: "入库数量不符",
    target: "IN-20260422-007",
    targetLabel: "入库单",
    currentValue: "差 4 件",
    threshold: "= 订单数量",
    duration: "35 分钟",
  },
  {
    id: "al-006",
    level: "info",
    category: "inventory",
    rule: "长期滞销",
    target: "SKU-30015",
    targetLabel: "牛仔裤 女款 S",
    currentValue: "90 天未出库",
    threshold: "≤ 60 天",
    duration: "今日触发",
  },
]

export default function AlertsPage() {
  const counts = {
    critical: MOCK_ALERTS.filter((a) => a.level === "critical").length,
    warning: MOCK_ALERTS.filter((a) => a.level === "warning").length,
    info: MOCK_ALERTS.filter((a) => a.level === "info").length,
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">数据预警</h1>
        <p className="text-muted-foreground text-sm">
          基于库存、出入库等业务表的预警规则，展示当前命中阈值的数据行。点击可跳转到源表查看详情。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-card rounded-lg border p-4 shadow-sm">
          <div className="text-muted-foreground text-sm">触发中预警</div>
          <div className="mt-2 text-2xl font-semibold">{MOCK_ALERTS.length}</div>
          <div className="text-muted-foreground mt-1 text-xs">
            关联 {new Set(MOCK_ALERTS.map((a) => a.category)).size} 类业务表
          </div>
        </div>
        {(["critical", "warning", "info"] as const).map((level) => {
          const style = LEVEL_STYLES[level]
          return (
            <div
              key={level}
              className="bg-card rounded-lg border p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block size-2 rounded-full ${style.dot}`}
                />
                <span className="text-muted-foreground text-sm">
                  {style.label}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold">{counts[level]}</div>
              <div className="text-muted-foreground mt-1 text-xs">未处理</div>
            </div>
          )
        })}
      </div>

      <div className="bg-card rounded-lg border shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium">触发列表</span>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span>共 {MOCK_ALERTS.length} 条</span>
            <button
              type="button"
              className="border-border hover:bg-accent text-foreground rounded-md border px-2.5 py-1 transition-colors"
            >
              管理预警规则
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-4 py-2 font-medium">严重度</th>
                <th className="px-4 py-2 font-medium">业务域</th>
                <th className="px-4 py-2 font-medium">规则</th>
                <th className="px-4 py-2 font-medium">数据对象</th>
                <th className="px-4 py-2 font-medium">当前值</th>
                <th className="px-4 py-2 font-medium">阈值</th>
                <th className="px-4 py-2 font-medium">持续</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {MOCK_ALERTS.map((alert) => {
                const style = LEVEL_STYLES[alert.level]
                return (
                  <tr key={alert.id} className="hover:bg-accent/30">
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}
                      >
                        <span
                          className={`inline-block size-1.5 rounded-full ${style.dot}`}
                        />
                        {style.label}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-2 text-xs">
                      {CATEGORY_LABELS[alert.category]}
                    </td>
                    <td className="px-4 py-2">{alert.rule}</td>
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs">{alert.target}</div>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {alert.targetLabel}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {alert.currentValue}
                    </td>
                    <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                      {alert.threshold}
                    </td>
                    <td className="text-muted-foreground px-4 py-2 text-xs">
                      {alert.duration}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground mr-3 text-xs transition-colors"
                      >
                        查看源数据
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                      >
                        忽略
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
