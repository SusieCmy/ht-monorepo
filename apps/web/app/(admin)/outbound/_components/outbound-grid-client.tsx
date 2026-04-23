"use client"

import { InboundGridClient } from "../../inbound/_components/inbound-grid-client"

// 出库页与入库页共用同一张表格（列 / 编辑 / 扩展列全一致）；
// 只通过 variant="outbound" 切换操作列按钮为「返库」与日期筛选标签。
export function OutboundGridClient() {
  return <InboundGridClient variant="outbound" />
}
