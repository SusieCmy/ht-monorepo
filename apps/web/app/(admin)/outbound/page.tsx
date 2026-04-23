import { OutboundGridClient } from "./_components/outbound-grid-client"

export default function OutboundPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">出库管理</h1>
        <p className="text-muted-foreground text-sm">
          管理销售、调拨、退货出库单据；如需返库，点击操作列「返库」即可将该单据状态置为「已返库」。
        </p>
      </div>

      <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
        <OutboundGridClient />
      </div>
    </div>
  )
}
