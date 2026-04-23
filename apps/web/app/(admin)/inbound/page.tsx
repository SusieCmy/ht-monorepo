import { InboundGridClient } from "./_components/inbound-grid-client"

export default function InboundPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">入库管理</h1>
        <p className="text-muted-foreground text-sm">
          管理采购、调拨、退货入库单据，自动联动库存更新与批次信息。
        </p>
      </div>

      <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
        <InboundGridClient />
      </div>
    </div>
  )
}
