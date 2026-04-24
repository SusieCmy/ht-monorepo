import { options, PrefetchHydrate } from "@/lib/query"

import { OutboundSheetClient } from "./_components/outbound-sheet-client"

/**
 * 出库页：对应 `sheet_config.id = 2` 这张可定制表。
 *
 * 和入库页的关系：
 *  - 完全复用 SheetGrid（列定义动态、导入导出、打印条码、筛选…全继承）；
 *  - 唯一不同的业务按钮是「返库」—— 把行从出库表搬回入库表；
 *  - 入库页的 OUTBOUND_SHEET_ID 与这里的 OUTBOUND_SHEET_ID 保持一致（2）。
 *
 * 预取：Server Component 先把 sheet-config / sheet-rows 首屏数据 prefetch 好，
 * 客户端挂载时直接从缓存读，不会有 loading→有数据的闪烁。
 */
const OUTBOUND_SHEET_ID = 2
const INBOUND_SHEET_ID = 1

export default function OutboundPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">出库管理</h1>
        <p className="text-muted-foreground text-sm">
          列结构由后台表格配置动态决定；单元格直接编辑即可保存，操作列支持返库、打印条码、删除。
        </p>
      </div>

      <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
        <PrefetchHydrate
          prefetch={async (qc) => {
            await Promise.all([
              qc.prefetchQuery(
                options.sheetConfigs.sheetConfigDetailOptions(OUTBOUND_SHEET_ID),
              ),
              qc.prefetchQuery(
                options.sheetRows.sheetRowListOptions({
                  sheetId: OUTBOUND_SHEET_ID,
                }),
              ),
            ])
          }}
        >
          <OutboundSheetClient
            outboundSheetId={OUTBOUND_SHEET_ID}
            inboundSheetId={INBOUND_SHEET_ID}
          />
        </PrefetchHydrate>
      </div>
    </div>
  )
}
