export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
        <p className="text-sm text-muted-foreground">
          欢迎回来，从左侧菜单开始你的后台操作。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "今日活跃", value: "1,284", hint: "较昨日 +12.3%" },
          { title: "本周新增用户", value: "328", hint: "较上周 +4.1%" },
          { title: "异常工单", value: "7", hint: "待处理" },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-lg border bg-card p-4 shadow-sm"
          >
            <div className="text-sm text-muted-foreground">{card.title}</div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {card.hint}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
