import { options, PrefetchHydrate } from "@/lib/query"

import { AlertSheetClient } from "./_components/alert-sheet-client"

/**
 * 库存预警页：
 *  - 数据源 = 入库表（`sheet_config.id = 1`），因为"未出库"等价于"还在入库表里"；
 *  - 业务规则：某个代表"库存 / 数量"的列值 < 10 即视为预警；
 *  - 操作列只保留"删除"：预警页不允许编辑、出库、打印 —— 只能标记处置。
 *
 * "库存列"怎么确定？走名字匹配：按 `STOCK_COLUMN_CANDIDATES` 里的优先级
 * 去找第一个 name 命中的列；找不到时 Client 端会给一个友好提示，提醒用户
 * 去入库页把某一列改名（或新建）为"库存"。这样不需要在 URL / env 里
 * 硬编码 col_id，换了环境也不会 break。
 *
 * 预取 sheet-config 即可；真正的行数据依赖"库存列 id"，只能在客户端拿到
 * config 之后再发查询。
 */
const INBOUND_SHEET_ID = 1

/** 阈值：库存 < STOCK_THRESHOLD 触发预警。未来挪到配置表里即可。 */
const STOCK_THRESHOLD = 10

/**
 * "库存列"候选名称（按优先级）。用户可以随意命名列，所以这里用一组
 * 常见叫法兜底；只要命中其一就算找到库存列。
 */
const STOCK_COLUMN_CANDIDATES = ["库存", "库存数量", "数量"] as const

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">数据预警</h1>
        <p className="text-muted-foreground text-sm">
          展示「入库表中库存数量 &lt; {STOCK_THRESHOLD}」且尚未出库的记录。
          命中的行可以在此直接删除（标记已处置），其余操作请回入库页处理。
        </p>
      </div>

      <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
        <PrefetchHydrate
          prefetch={async (qc) => {
            // 行数据需要库存列 id 才能确定 filter，这里只预取配置；
            // 客户端拿到 config 后再走 sheetRowListOptions。
            await qc.prefetchQuery(
              options.sheetConfigs.sheetConfigDetailOptions(INBOUND_SHEET_ID),
            )
          }}
        >
          <AlertSheetClient
            sheetId={INBOUND_SHEET_ID}
            stockColumnCandidates={STOCK_COLUMN_CANDIDATES}
            stockThreshold={STOCK_THRESHOLD}
          />
        </PrefetchHydrate>
      </div>
    </div>
  )
}
