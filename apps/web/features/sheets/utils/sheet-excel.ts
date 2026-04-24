/**
 * 动态表格的 Excel 互操作工具：模板下载 / 数据导出 / 文件解析。
 *
 * 设计原则：
 *  1. 所有列都是动态的（`SheetColumn[]`），不能像旧 inbound-import 那样
 *     写死固定字段；表头文案以列的中文 `name` 为准。
 *  2. 解析时以表头 `name` 为主键匹配列，匹配不到的列忽略，避免因为
 *     用户改过列名 / 加过列导致导入整体失败。
 *  3. 日期、数字在写出时尽量用 Excel 原生类型（`t: "n" | "d"`），
 *     这样用户打开文件不会看到奇怪的文本对齐。
 *  4. dict 列存的是中文 label；模板示例值取字典的第一个 item，让用户
 *     看到一眼就知道该填什么。
 */

import * as XLSX from "xlsx"

import type { DictItem } from "@/lib/query/options/dicts"
import type {
  SheetColumn,
  SheetConfig,
} from "@/lib/query/options/sheet-configs"
import type { SheetRow } from "@/lib/query/options/sheet-rows"

/** 导入解析的结果。rows 可以直接丢给后端 `POST /sheet-row-index/bulk`。 */
export interface SheetImportResult {
  /** 解析后的行数据，values 的 key 已经是列 id（如 `col_1`）。 */
  rows: Array<{ values: Record<string, string> }>
  /** 表头里真正被识别到的列（按出现顺序），调试用。 */
  matchedColumns: SheetColumn[]
  /** 表头里无法识别的列名，前端可以提示用户。 */
  unknownHeaders: string[]
  /** 解析过程中产生的软告警（列不匹配、日期回退等），展示给用户。 */
  warnings: string[]
  /** Excel 里原始的数据行数（不含表头）。 */
  total: number
}

/**
 * 选项：传字典映射可以让"导出"时把 dict 列的值原样保留 label，
 * 以及"模板"时给一个真实存在的字典项作为示例。都是可选的，
 * 传空也不会出错，只是模板的示例值会变成空串。
 */
export interface SheetExcelOptions {
  dictItemsByCode?: Record<string, DictItem[]>
}

const MISC_DATE_ISO = () => new Date().toISOString().slice(0, 10)

function safeSheetName(name: string): string {
  // Excel 31 字符上限 + 禁止的特殊字符 \ / ? * [ ]。兜底给个"表格"。
  const cleaned = name.replace(/[\\/?*[\]:]/g, "").trim()
  return cleaned.length === 0 ? "表格" : cleaned.slice(0, 31)
}

/** 同名列回退：表头重名时 XLSX 会自动加 `_1` 后缀，这里解析时脱掉。 */
function stripDupeSuffix(header: string): string {
  return header.replace(/_\d+$/, "").trim()
}

/**
 * 根据列类型给出一个"看得懂的示例值"。模板里有这行示例：
 *  - 用户能一眼看出每列该填什么；
 *  - 解析时示例行会被正常吃掉，不会当成脏数据报错 —— 这是设计预期：
 *    真实场景用户会覆盖这一行，或者开始填第 3 行再删掉第 2 行。
 */
function sampleValueFor(
  col: SheetColumn,
  dictItemsByCode: Record<string, DictItem[]> | undefined,
): string | number | Date {
  switch (col.type) {
    case "number":
      return 0
    case "date":
      return new Date()
    case "dict": {
      const items = col.dictTypeCode
        ? dictItemsByCode?.[col.dictTypeCode] ?? []
        : []
      return items[0]?.label ?? ""
    }
    default:
      return ""
  }
}

/** 把导出的单元格值转换成 XLSX 单元格对象，保留原生类型。 */
function toCell(col: SheetColumn, raw: string) {
  if (raw === "" || raw == null) return { v: "", t: "s" as const }
  if (col.type === "number") {
    const n = Number(raw)
    if (Number.isFinite(n)) return { v: n, t: "n" as const }
    return { v: raw, t: "s" as const }
  }
  if (col.type === "date") {
    // 严格只接受 ISO 短日期，其它形式直接按文本写出，避免瞎转。
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw)
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      if (!Number.isNaN(d.getTime())) {
        return { v: d, t: "d" as const, z: "yyyy-mm-dd" }
      }
    }
  }
  return { v: raw, t: "s" as const }
}

/**
 * 生成下载模板：表头 + 一行示例。
 *
 * 表头选用 `column.name` 而不是 `column.id`，原因：
 *  - 用户打开模板看的是中文，不是 col_1/col_2；
 *  - 反向解析时我们同时接受 name 和 id，误填不会 break。
 */
export function downloadSheetTemplate(
  config: SheetConfig,
  options: SheetExcelOptions = {},
): void {
  const columns = config.columns
  const headers = columns.map((c) => c.name || c.id)

  const sampleCells = columns.map((col) => {
    const v = sampleValueFor(col, options.dictItemsByCode)
    if (v instanceof Date) return { v, t: "d" as const, z: "yyyy-mm-dd" }
    if (typeof v === "number") return { v, t: "n" as const }
    return { v: String(v ?? ""), t: "s" as const }
  })

  const sheet = XLSX.utils.aoa_to_sheet([headers])
  // aoa_to_sheet 写 Date 会被转字符串，这里手动把示例行按原生类型写进去。
  sampleCells.forEach((cell, i) => {
    const addr = XLSX.utils.encode_cell({ r: 1, c: i })
    sheet[addr] = cell
  })
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: 1, c: Math.max(0, headers.length - 1) },
  })
  sheet["!cols"] = headers.map((h) => ({
    wch: Math.max(10, Math.min(28, (h?.length ?? 6) * 2 + 4)),
  }))

  const book = XLSX.utils.book_new()
  const sheetTitle = safeSheetName(config.name || "模板")
  XLSX.utils.book_append_sheet(book, sheet, sheetTitle)

  const filename = `${config.name || "表格"}-导入模板.xlsx`
  XLSX.writeFile(book, filename)
}

/**
 * 导出当前行到 Excel。会额外带一列 ID 方便后续反查，
 * 但 ID 写在最左边、灰色语义（仅文本）。
 */
export function exportSheetRows(
  config: SheetConfig,
  rows: SheetRow[],
  options: SheetExcelOptions = {},
): void {
  void options // 预留：未来可用 dictItemsByCode 做 label/value 切换
  const columns = config.columns
  const headers = ["ID", ...columns.map((c) => c.name || c.id)]

  const data: unknown[][] = [headers]
  for (const row of rows) {
    // id < 0 是前端乐观占位临时 id（useCreateSheetRow），不导出污染数据。
    const idCell = row.id > 0 ? row.id : ""
    const line: unknown[] = [idCell]
    for (const col of columns) {
      const raw = row.values?.[col.id] ?? ""
      line.push(raw)
    }
    data.push(line)
  }

  const sheet = XLSX.utils.aoa_to_sheet(data)
  // 为 number / date 列回写原生类型，让 Excel 打开后格式正常。
  for (let r = 1; r < data.length; r++) {
    for (let c = 1; c < headers.length; c++) {
      const col = columns[c - 1]
      if (!col) continue
      const raw = String((data[r] as unknown[])[c] ?? "")
      const addr = XLSX.utils.encode_cell({ r, c })
      sheet[addr] = toCell(col, raw)
    }
  }
  sheet["!cols"] = headers.map((h) => ({
    wch: Math.max(10, Math.min(28, (h?.length ?? 6) * 2 + 4)),
  }))

  const book = XLSX.utils.book_new()
  const sheetTitle = safeSheetName(config.name || "导出")
  XLSX.utils.book_append_sheet(book, sheet, sheetTitle)

  const stamp = MISC_DATE_ISO()
  const filename = `${config.name || "表格"}-${stamp}.xlsx`
  XLSX.writeFile(book, filename)
}

function toIsoDate(v: unknown): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ""
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, "0")
    const d = String(v.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  const s = String(v ?? "").trim()
  if (!s) return ""
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return toIsoDate(d)
}

function toStringValue(v: unknown): string {
  if (v == null) return ""
  if (v instanceof Date) return toIsoDate(v)
  return String(v).trim()
}

/**
 * 解析用户上传的 Excel，返回可直接 POST 到 `/sheet-row-index/bulk` 的行数组。
 *
 * 匹配规则：
 *  - 表头完全等于 `column.name`（首选）；
 *  - 或等于 `column.id`（兼容导出文件反向导入）；
 *  - "ID" 列忽略（导出时加的、用户手改没意义）；
 *  - 完全无法识别的列累计到 `unknownHeaders`，给 UI 提示。
 */
export async function parseSheetRowsFromXlsx(
  file: File,
  columns: SheetColumn[],
): Promise<SheetImportResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array", cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return {
      rows: [],
      matchedColumns: [],
      unknownHeaders: [],
      warnings: ["Excel 文件里找不到任何 sheet"],
      total: 0,
    }
  }
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return {
      rows: [],
      matchedColumns: [],
      unknownHeaders: [],
      warnings: ["Excel 首个 sheet 读取失败"],
      total: 0,
    }
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  })

  // 表头 -> SheetColumn 索引。先按 name，再按 id。
  const byName = new Map<string, SheetColumn>()
  const byId = new Map<string, SheetColumn>()
  for (const c of columns) {
    if (c.name) byName.set(c.name.trim(), c)
    byId.set(c.id, c)
  }

  const warnings: string[] = []
  const unknownHeaders = new Set<string>()
  const matched = new Set<SheetColumn>()
  const rows: Array<{ values: Record<string, string> }> = []

  raw.forEach((record, i) => {
    const rowNo = i + 2 // 表头是第 1 行，数据从第 2 行开始
    const values: Record<string, string> = {}

    for (const headerRaw of Object.keys(record)) {
      const header = stripDupeSuffix(headerRaw)
      if (header === "ID" || header === "id") continue
      const col = byName.get(header) ?? byId.get(header)
      if (!col) {
        unknownHeaders.add(header)
        continue
      }
      matched.add(col)

      const rawValue = record[headerRaw]
      if (col.type === "number") {
        const s = toStringValue(rawValue)
        if (s === "") {
          values[col.id] = ""
        } else {
          const n = Number(s)
          if (Number.isFinite(n)) {
            values[col.id] = String(n)
          } else {
            warnings.push(`第 ${rowNo} 行「${header}」不是合法数字，已忽略该格`)
          }
        }
      } else if (col.type === "date") {
        const iso = toIsoDate(rawValue)
        values[col.id] = iso
      } else {
        values[col.id] = toStringValue(rawValue)
      }
    }

    // 整行一个有效值都没有 —— 跳过，避免把"示例行删了但格子还在"当成脏数据。
    const hasAny = Object.values(values).some((v) => v !== "")
    if (!hasAny) return
    rows.push({ values })
  })

  return {
    rows,
    matchedColumns: [...matched],
    unknownHeaders: [...unknownHeaders],
    warnings,
    total: raw.length,
  }
}
