export default function OutboundPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">出库管理</h1>
        <p className="text-muted-foreground text-sm">
          管理销售、调拨、退货出库单据，自动联动库存扣减与物流信息。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "今日出库单", value: "18", hint: "较昨日 -2" },
          { title: "本周出库总量", value: "4,126", hint: "件" },
          { title: "待发货", value: "9", hint: "超过 24h 未处理 2 单" },
          { title: "本月退货", value: "3", hint: "待入库登记" },
        ].map((card) => (
          <div
            key={card.title}
            className="bg-card rounded-lg border p-4 shadow-sm"
          >
            <div className="text-muted-foreground text-sm">{card.title}</div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
            <div className="text-muted-foreground mt-1 text-xs">
              {card.hint}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card text-muted-foreground rounded-lg border p-8 text-center text-sm shadow-sm">
        出库单列表将显示在此处（等待接入 API）。
      </div>
    </div>
  )
}
