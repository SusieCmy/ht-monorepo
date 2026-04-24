import { options, PrefetchHydrate } from "@/lib/query"
import {
  PRODUCT_COLUMN_CANDIDATES,
  STOCK_COLUMN_CANDIDATES,
} from "@/features/sheets/utils/stock-columns"

import { AlertSheetClient } from "./_components/alert-sheet-client"

/**
 * 库存预警页：
 *  - 数据源 = 入库表（`sheet_config.id = 1`），因为"未出库"等价于"还在入库表里"；
 *  - 业务规则：每个商品可单独配置"库存 < 阈值"触发预警，未配置的走默认阈值；
 *  - 操作列只保留"删除"：预警页不允许编辑、出库、打印，只能标记处置；
 *  - 阈值配置走 `alert_rule` 表，命中查询走 `/alert-rule/hits`。
 *
 * 关键列通过「候选名称」兜底匹配，用户可以随意命名列：
 *   - 库存列：库存 / 库存数量 / 数量
 *   - 商品列：商品名称 / 商品 / 名称
 * 命中其一即认为找到。改了列名记得同步这里的候选列表。
 */
const INBOUND_SHEET_ID = 1

/** 默认阈值：没有单独配置阈值的商品用这个值兜底。 */
const DEFAULT_STOCK_THRESHOLD = 10

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">数据预警</h1>
        <p className="text-muted-foreground text-sm">
          展示「入库表中库存数量 ≤ 阈值」的未出库记录（已触达阈值即视为命中）。
          默认阈值 {DEFAULT_STOCK_THRESHOLD}
          ，可在右上角「预警设置」中为每个商品单独配置。
        </p>
      </div>

      <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
        <PrefetchHydrate
          prefetch={async (qc) => {
            // 行数据需要商品列 / 库存列 id 才能确定 filter，这里只预取配置。
            await qc.prefetchQuery(
              options.sheetConfigs.sheetConfigDetailOptions(INBOUND_SHEET_ID),
            )
          }}
        >
          <AlertSheetClient
            sheetId={INBOUND_SHEET_ID}
            stockColumnCandidates={STOCK_COLUMN_CANDIDATES}
            productColumnCandidates={PRODUCT_COLUMN_CANDIDATES}
            initialStockThreshold={DEFAULT_STOCK_THRESHOLD}
          />
        </PrefetchHydrate>
      </div>
    </div>
  )
}
