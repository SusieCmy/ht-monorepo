import { options, PrefetchHydrate } from "@/lib/query"

import { InboundSheetClient } from "./_components/inbound-sheet-client"

/**
 * 入库页：对应 `sheet_config.id = 1` 这张可定制表。
 * Server Component 里用 PrefetchHydrate 把表格配置 + 首页行数据预取好，
 * 客户端组件挂载时直接从缓存读取，不会出现 loading→有数据的闪烁。
 *
 * OUTBOUND_SHEET_ID 用于"出库"按钮：点击后把行从入库表搬到出库表。
 */
const INBOUND_SHEET_ID = 1
const OUTBOUND_SHEET_ID = 2

export default function InboundPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">入库管理</h1>
        <p className="text-muted-foreground text-sm">
          列结构由后台表格配置动态决定；单元格直接编辑即可保存，操作列支持出库、打印条码、删除。
        </p>
      </div>

      <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
        <PrefetchHydrate
          prefetch={async (qc) => {
            await Promise.all([
              qc.prefetchQuery(
                options.sheetConfigs.sheetConfigDetailOptions(INBOUND_SHEET_ID),
              ),
              qc.prefetchQuery(
                options.sheetRows.sheetRowListOptions({
                  sheetId: INBOUND_SHEET_ID,
                }),
              ),
            ])
          }}
        >
          <InboundSheetClient
            inboundSheetId={INBOUND_SHEET_ID}
            outboundSheetId={OUTBOUND_SHEET_ID}
          />
        </PrefetchHydrate>
      </div>
    </div>
  )
}
