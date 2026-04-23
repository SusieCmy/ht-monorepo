import * as XLSX from "xlsx"

import { STATUS_OPTIONS, SUPPLIER_OPTIONS } from "./inbound-filter-form"
import type { InboundRow } from "./types"

/**
 * 把 Excel 表头文本映射到 InboundRow 的字段名。
 * key 必须是 .toLowerCase().trim() 后的结果。
 */
const HEADER_ALIASES: Record<string, keyof Omit<InboundRow, "ext">> = {
  // 入库单号 / 出库单号 都复用同一个 id 字段
  id: "id",
  "入库单号": "id",
  "出库单号": "id",
  "单号": "id",
  "编号": "id",

  sku: "sku",

  product: "product",
  "商品名称": "product",
  "商品": "product",

  batch: "batch",
  "批次号": "batch",
  "批次": "batch",

  qty: "qty",
  "数量": "qty",

  date: "date",
  "日期": "date",
  "入库日期": "date",
  "出库日期": "date",

  supplier: "supplier",
  "供应商": "supplier",

  status: "status",
  "状态": "status",
}

function lookupField(header: string): keyof Omit<InboundRow, "ext"> | null {
  const norm = header.trim().toLowerCase()
  return HEADER_ALIASES[norm] ?? null
}

/**
 * 各种常见的日期写法尽量归一化成 ISO "YYYY-MM-DD"。
 * - XLSX 开 `cellDates: true` 后，真实日期会是 Date 对象；
 * - 否则可能是 "2026-04-22" / "2026/4/22" / "2026.04.22" 等字符串；
 * 任何无法识别的，回退为今天，避免字符串排序失效。
 */
function toIsoDate(v: unknown): string {
  const fallback = new Date().toISOString().slice(0, 10)
  const fmt = (d: Date) => {
    if (Number.isNaN(d.getTime())) return fallback
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  if (v instanceof Date) return fmt(v)
  const s = String(v ?? "").trim()
  if (!s) return fallback
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`
  return fmt(new Date(s))
}

function toStringValue(v: unknown): string {
  if (v == null) return ""
  if (v instanceof Date) return toIsoDate(v)
  return String(v).trim()
}

export interface InboundImportResult {
  rows: InboundRow[]
  warnings: string[]
  /** 原始总行数（不含表头） */
  total: number
}

export interface InboundImportOptions {
  /** 当前动态扩展列，用于把同名表头的值塞进 row.ext[id] */
  dynamicColumns: readonly { id: string; headerName: string }[]
  /** 入库 / 出库。影响自动生成 id 的前缀与默认 status。 */
  variant: "inbound" | "outbound"
}

/**
 * 读取一个 .xlsx / .xls 文件，按中文/英文表头映射成 InboundRow 数组。
 * 读第一个 sheet，第一行视为表头。
 */
export async function parseInboundXlsx(
  file: File,
  options: InboundImportOptions,
): Promise<InboundImportResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array", cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { rows: [], warnings: ["Excel 文件里找不到任何 sheet"], total: 0 }
  }
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return { rows: [], warnings: ["Excel 首个 sheet 读取失败"], total: 0 }
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  })

  const dynByHeader = new Map(
    options.dynamicColumns.map(
      (c) => [c.headerName.trim(), c.id] as const,
    ),
  )

  const idPrefix = options.variant === "outbound" ? "OUT-" : "IN-"
  const defaultStatus: InboundRow["status"] =
    options.variant === "outbound" ? "在途" : "已入库"
  const todayIso = new Date().toISOString().slice(0, 10)

  const warnings: string[] = []
  const rows: InboundRow[] = []

  raw.forEach((record, i) => {
    const rowNo = i + 2 // Excel 行号：+1 是 1-based，+1 因为第一行是表头
    const row: InboundRow = {
      id: "",
      sku: "",
      product: "",
      batch: "",
      qty: 0,
      date: todayIso,
      supplier: "华源",
      status: defaultStatus,
    }
    const ext: Record<string, string> = {}

    for (const key of Object.keys(record)) {
      const value = record[key]
      const field = lookupField(key)
      if (field) {
        if (field === "qty") {
          const n = Number(value)
          row.qty = Number.isFinite(n) ? n : 0
        } else if (field === "date") {
          row.date = toIsoDate(value)
        } else if (field === "supplier") {
          const s = toStringValue(value)
          if (!s) continue
          if ((SUPPLIER_OPTIONS as readonly string[]).includes(s)) {
            row.supplier = s as InboundRow["supplier"]
          } else {
            warnings.push(
              `第 ${rowNo} 行供应商 “${s}” 未在字典内，已回退为 “华源”`,
            )
          }
        } else if (field === "status") {
          const s = toStringValue(value)
          if (!s) continue
          if ((STATUS_OPTIONS as readonly string[]).includes(s)) {
            row.status = s as InboundRow["status"]
          } else {
            warnings.push(
              `第 ${rowNo} 行状态 “${s}” 未在字典内，已回退为 “${defaultStatus}”`,
            )
          }
        } else {
          // id / sku / product / batch 这几列都按字符串处理
          row[field] = toStringValue(value)
        }
        continue
      }
      // 不在固定字段里，就尝试匹配动态扩展列（按表头名）
      const colId = dynByHeader.get(key.trim())
      if (colId) ext[colId] = toStringValue(value)
    }

    if (!row.id) {
      // Excel 没填单号时兜底生成，用时间戳 + 行号，导入多次也不重复。
      row.id = `${idPrefix}${Date.now()}-${i + 1}`
    }
    if (Object.keys(ext).length > 0) row.ext = ext
    rows.push(row)
  })

  return { rows, warnings, total: raw.length }
}

/**
 * 生成导入模板并触发浏览器下载。模板里包含：
 *  - 固定列中文表头
 *  - 当前所有动态扩展列的表头（用它们在 UI 上显示的名字）
 *  - 一行示例数据，提示每列合法取值 / 格式
 *
 * 表头文案与 parseInboundXlsx 的 HEADER_ALIASES 对齐，回填时 100% 命中。
 */
export function downloadInboundTemplate(options: InboundImportOptions): void {
  const isOutbound = options.variant === "outbound"
  const baseHeaders = [
    isOutbound ? "出库单号" : "入库单号",
    "SKU",
    "商品名称",
    "批次号",
    "数量",
    isOutbound ? "出库日期" : "入库日期",
    "供应商",
    "状态",
  ]
  const dynamicHeaders = options.dynamicColumns.map((c) => c.headerName)
  const headers = [...baseHeaders, ...dynamicHeaders]

  const today = new Date().toISOString().slice(0, 10)
  const sampleRow: Array<string | number> = [
    isOutbound ? "OUT-20260101-001" : "IN-20260101-001",
    "SKU-10001",
    "示例商品",
    "B20260101A",
    100,
    today,
    SUPPLIER_OPTIONS[0],
    isOutbound ? "在途" : STATUS_OPTIONS[0],
    ...dynamicHeaders.map(() => ""),
  ]

  const sheet = XLSX.utils.aoa_to_sheet([headers, sampleRow])
  // 给每列一个合理的默认宽度，长字段略宽一点。
  sheet["!cols"] = headers.map((h) => ({
    wch: Math.max(12, Math.min(24, h.length * 2 + 4)),
  }))

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, isOutbound ? "出库单" : "入库单")

  const filename = isOutbound
    ? "出库导入模板.xlsx"
    : "入库导入模板.xlsx"
  XLSX.writeFile(book, filename)
}
