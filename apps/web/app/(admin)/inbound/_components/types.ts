export interface InboundRow {
  id: string
  sku: string
  product: string
  batch: string
  qty: number
  date: string
  supplier: "华源" | "顺丰" | "京东物流"
  status: "已入库" | "在途" | "待检" | "已返库"
  /** 动态列的值，key 为列 id（如 dyn_123） */
  ext?: Record<string, string>
}
