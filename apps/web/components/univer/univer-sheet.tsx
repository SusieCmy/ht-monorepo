"use client"

import { useEffect, useRef, useState } from "react"

import { LocaleType, createUniver, merge } from "@univerjs/presets"
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core"
import sheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN"
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation"
import dataValidationZhCN from "@univerjs/preset-sheets-data-validation/locales/zh-CN"

import "@univerjs/preset-sheets-core/lib/index.css"
import "@univerjs/preset-sheets-data-validation/lib/index.css"

type UniverAPI = ReturnType<typeof createUniver>["univerAPI"]

export type ColumnType = "text" | "number" | "date" | "select"

export interface Column {
  id: string
  name: string
  type: ColumnType
  filterable: boolean
  /** 可筛选时预置的筛选值；筛选条下拉只展示这些。 */
  filterOptions?: string[]
}

export type FilterCriterion =
  | { kind: "enum"; value: string }
  | { kind: "numberRange"; min: number | null; max: number | null }
  | { kind: "dateRange"; from: string | null; to: string | null }

export type Filters = Record<number, FilterCriterion | null | undefined>

export interface UniverSheetApi {
  syncColumns: (columns: Column[]) => void
  applyFilters: (filters: Filters) => void
  setRows: (rows: (string | number | null)[][]) => void
  getRowData: (row: number) => (string | number | null)[]
  onSelectionChange: (cb: (row: number) => void) => () => void
  getRowHeights: () => number[]
  getMaxRows: () => number
}

// Excel-style 1900 date system anchor: serial 1 = 1900-01-01.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)

// 用正则手动拆 y/m/d，结果一律当成 UTC 零点，避免 Date.parse 在不同浏览器、
// 不同分隔符下混用 UTC / 本地时区的锅（例如 "2026/4/22" 走本地、"2026-04-22"
// 走 UTC，东八区下差 8 小时，做日筛选会直接漏掉当天数据）。
function parseYmdToUtcMs(s: string): number | null {
  const m = s.match(/(\d{4})[\-/.年](\d{1,2})[\-/.月](\d{1,2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || !mo || !d) return null
  return Date.UTC(y, mo - 1, d)
}

function cellToTimestamp(raw: unknown): number | null {
  if (raw == null || raw === "") return null
  if (typeof raw === "number") {
    // Treat plausibly-small numbers as Excel serials (covers ~1941..2064).
    if (raw > 10000 && raw < 80000) return EXCEL_EPOCH_MS + raw * 86_400_000
    return raw
  }
  const s = String(raw).trim()
  if (!s) return null
  const ymd = parseYmdToUtcMs(s)
  if (ymd != null) return ymd
  const fallback = Date.parse(s)
  return Number.isNaN(fallback) ? null : fallback
}

function isoToStartMs(iso: string | null): number | null {
  if (!iso) return null
  return parseYmdToUtcMs(iso)
}

function isoToEndMs(iso: string | null): number | null {
  const t = isoToStartMs(iso)
  return t == null ? null : t + 86_399_999
}

function rowMatchesCriterion(
  raw: unknown,
  criterion: FilterCriterion,
): boolean {
  switch (criterion.kind) {
    case "enum": {
      const s = raw == null ? "" : String(raw)
      return s === criterion.value
    }
    case "numberRange": {
      if (criterion.min == null && criterion.max == null) return true
      if (raw == null || raw === "") return false
      const n = typeof raw === "number" ? raw : Number(String(raw))
      if (Number.isNaN(n)) return false
      if (criterion.min != null && n < criterion.min) return false
      if (criterion.max != null && n > criterion.max) return false
      return true
    }
    case "dateRange": {
      if (!criterion.from && !criterion.to) return true
      const ts = cellToTimestamp(raw)
      if (ts == null) return false
      const lo = isoToStartMs(criterion.from)
      const hi = isoToEndMs(criterion.to)
      if (lo != null && ts < lo) return false
      if (hi != null && ts > hi) return false
      return true
    }
  }
}

function isCriterionActive(c: FilterCriterion): boolean {
  switch (c.kind) {
    case "enum":
      return c.value !== ""
    case "numberRange":
      return c.min != null || c.max != null
    case "dateRange":
      return !!c.from || !!c.to
  }
}

export interface UniverSheetProps {
  workbookId?: string
  workbookName?: string
  initialColumns?: Column[]
  rowCount?: number
  reservedColumnCount?: number
  onApi?: (api: UniverSheetApi) => void
  className?: string
  /** 条形码列的列索引，该列单元格渲染为可点击按钮 */
  barcodeColumnIndex?: number
  /** 点击条形码按钮时回调，参数为行索引 */
  onBarcodeClick?: (row: number) => void
}

const HEADER_STYLE = {
  fontColor: "#111827",
  backgroundColor: "#f3f4f6",
  fontSize: 12,
  textAlign: "center" as CanvasTextAlign,
  textBaseline: "middle" as CanvasTextBaseline,
  fontFamily: "Arial",
  borderColor: "#e5e7eb",
}

function buildColumnsCfg(columns: Column[]) {
  const cfg: Record<number, string> = {}
  columns.forEach((col, i) => {
    cfg[i] = col.name
  })
  return cfg
}

export function UniverSheet({
  workbookId = "hh-admin-inbound",
  workbookName = "入库单",
  initialColumns = [],
  rowCount = 200,
  reservedColumnCount = 20,
  onApi,
  className,
  barcodeColumnIndex,
  onBarcodeClick,
}: UniverSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<UniverAPI | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onApiRef = useRef(onApi)
  onApiRef.current = onApi
  const onBarcodeClickRef = useRef(onBarcodeClick)
  onBarcodeClickRef.current = onBarcodeClick

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false

    try {
      const { univerAPI } = createUniver({
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: merge(
            {},
            sheetsCoreZhCN,
            dataValidationZhCN,
          ),
        },
        presets: [
          UniverSheetsCorePreset({
            container,
            ribbonType: "simple",
            menu: {
              // 隐藏布局/对齐
              "sheet.command.set-horizontal-text-align": { hidden: true },
              "sheet.command.set-vertical-text-align": { hidden: true },
              "sheet.command.set-text-wrap": { hidden: true },
              "sheet.command.set-text-rotation": { hidden: true },
              "sheet.command.add-worksheet-merge": { hidden: true },
              // 隐藏工具
              "sheet.command.set-once-format-painter": { hidden: true },
              "sheet.command.clear-selection-all": { hidden: true },
              "sheet.command.add-range-protection-from-toolbar": { hidden: true },
              // 隐藏数据
              "sheet.toolbar.text-to-number": { hidden: true },
              // 隐藏公式
              "formula-ui.operation.insert-function.common": { hidden: true },
              "formula-ui.operation.insert-function.financial": { hidden: true },
              "formula-ui.operation.insert-function.logical": { hidden: true },
              "formula-ui.operation.insert-function.text": { hidden: true },
              "formula-ui.operation.insert-function.date": { hidden: true },
              "formula-ui.operation.insert-function.lookup": { hidden: true },
              "formula-ui.operation.insert-function.math": { hidden: true },
              "formula-ui.operation.insert-function.statistical": { hidden: true },
              "formula-ui.operation.insert-function.engineering": { hidden: true },
              "formula-ui.operation.insert-function.information": { hidden: true },
              "formula-ui.operation.insert-function.database": { hidden: true },
            },
          }),
          UniverSheetsDataValidationPreset({ showEditOnDropdown: false }),
        ],
        plugins: [],
      })

      apiRef.current = univerAPI

      const sheetId = "sheet-01"
      const effectiveColumnCount = Math.max(
        initialColumns.length,
        reservedColumnCount,
      )

      univerAPI.createWorkbook({
        id: workbookId,
        name: workbookName,
        sheetOrder: [sheetId],
        sheets: {
          [sheetId]: {
            id: sheetId,
            name: workbookName,
            rowCount,
            columnCount: effectiveColumnCount,
          },
        },
      })

      const getSheet = () =>
        univerAPI.getActiveWorkbook()?.getActiveSheet() ?? null

      // 注册条形码列单元格渲染器
      if (barcodeColumnIndex !== undefined) {
        univerAPI.getSheetHooks().onCellRender([{
          zIndex: 10,
          drawWith(ctx, info) {
            const { row, col, primaryWithCoord } = info
            if (col !== barcodeColumnIndex) return
            const { startX, startY, endX, endY } = primaryWithCoord
            const w = endX - startX
            const h = endY - startY
            const cx = startX + w / 2
            const cy = startY + h / 2
            const r = Math.min(w, h) * 0.3
            // 画圆形按钮背景
            ctx.save()
            ctx.fillStyle = "#f3f4f6"
            ctx.strokeStyle = "#d1d5db"
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
            // 画条形码图标（三条竖线）
            ctx.fillStyle = "#374151"
            const barW = r * 0.18
            const barH = r * 0.9
            const gap = r * 0.28
            for (let i = -1; i <= 1; i++) {
              ctx.fillRect(cx + i * gap - barW / 2, cy - barH / 2, barW, barH)
            }
            ctx.restore()
          },
          isHit(pos, info) {
            if (info.col !== barcodeColumnIndex) return false
            const { startX, startY, endX, endY } = info.primaryWithCoord
            return pos.x >= startX && pos.x <= endX && pos.y >= startY && pos.y <= endY
          },
          onPointerDown(info) {
            onBarcodeClickRef.current?.(info.row)
          },
        }])
      }

      // Paint custom column header (the A/B/C bar itself) with our names.
      // FWorksheet#customizeColumnHeader stores the config on the render
      // component but does NOT repaint the canvas (the FUniver facade version
      // does, but the worksheet version does not). We call refreshCanvas
      // ourselves so the names actually appear.
      const paintHeader = (cols: Column[]) => {
        const ws = getSheet()
        if (!ws) return
        try {
          ws.customizeColumnHeader({
            headerStyle: HEADER_STYLE,
            columnsCfg: buildColumnsCfg(cols),
          })
          ws.refreshCanvas()
        } catch (err) {
          // Render component may not be ready on the very first tick after
          // createWorkbook; retry on the next frame.
          if (typeof requestAnimationFrame !== "undefined") {
            requestAnimationFrame(() => {
              const ws2 = getSheet()
              if (!ws2) return
              ws2.customizeColumnHeader({
                headerStyle: HEADER_STYLE,
                columnsCfg: buildColumnsCfg(cols),
              })
              ws2.refreshCanvas()
            })
          } else {
            console.warn("[UniverSheet] customizeColumnHeader failed", err)
          }
        }
      }

      // Build a data validation rule for a single column based on its type.
      // Returns null for "anything goes" (text, or select without options).
      const buildRuleForColumn = (col: Column) => {
        switch (col.type) {
          case "number": {
            // "任意数字" 在 Univer 里没有专用方法，用极大范围近似，
            // 再配合不允许无效值 → 非数字会被拒绝。
            return univerAPI
              .newDataValidation()
              .requireNumberBetween(
                Number.MIN_SAFE_INTEGER,
                Number.MAX_SAFE_INTEGER,
              )
              .setAllowInvalid(false)
              .setAllowBlank(true)
              .setOptions({
                showErrorMessage: true,
                error: `${col.name} 仅允许输入数字`,
              })
              .build()
          }
          case "date": {
            // "任意日期"：1900 之后即可。
            return univerAPI
              .newDataValidation()
              .requireDateOnOrAfter(new Date("1900-01-01"))
              .setAllowInvalid(false)
              .setAllowBlank(true)
              .setOptions({
                showErrorMessage: true,
                error: `${col.name} 仅允许输入日期`,
              })
              .build()
          }
          case "select": {
            const options = col.filterOptions?.filter(Boolean) ?? []
            if (options.length === 0) return null
            return univerAPI
              .newDataValidation()
              .requireValueInList(options, false, true)
              .setAllowInvalid(false)
              .setAllowBlank(true)
              .setOptions({
                showErrorMessage: true,
                error: `${col.name} 仅允许从下拉中选择`,
              })
              .build()
          }
          case "text":
          default:
            return null
        }
      }

      // Apply validation rules to the data range (all rows) of every column.
      // Passing null to setDataValidation clears the previous rule, so changing
      // a column's type (e.g. number → text) removes stale constraints.
      const applyValidations = (cols: Column[]) => {
        const ws = getSheet()
        if (!ws) return
        const maxRows = ws.getMaxRows()
        if (maxRows <= 0) return

        cols.forEach((col, i) => {
          const range = ws.getRange(0, i, maxRows, 1)
          const rule = buildRuleForColumn(col)
          range.setDataValidation(rule)
        })
      }

      let currentLen = initialColumns.length
      paintHeader(initialColumns)
      applyValidations(initialColumns)

      const api: UniverSheetApi = {
        syncColumns(cols) {
          const ws = getSheet()
          if (!ws) return

          const nextLen = cols.length
          if (nextLen > currentLen) {
            const maxCols = ws.getMaxColumns()
            if (nextLen > maxCols) {
              ws.insertColumnsAfter(maxCols - 1, nextLen - maxCols)
            }
          } else if (nextLen < currentLen) {
            const removeCount = currentLen - nextLen
            // Clear rules on columns that are about to be removed, so they
            // don't leave dangling rule metadata.
            for (let i = nextLen; i < currentLen; i++) {
              ws.getRange(0, i, ws.getMaxRows(), 1).setDataValidation(null)
            }
            ws.deleteColumns(nextLen, removeCount)
          }
          currentLen = nextLen
          paintHeader(cols)
          applyValidations(cols)
        },
        applyFilters(filters) {
          const ws = getSheet()
          if (!ws) return

          const active: Array<[number, FilterCriterion]> = []
          for (const [idxStr, criterion] of Object.entries(filters)) {
            if (!criterion) continue
            if (!isCriterionActive(criterion)) continue
            active.push([Number(idxStr), criterion])
          }

          const maxRows = ws.getMaxRows()
          if (maxRows <= 0) return

          // Reset visibility first, then hide rows that don't satisfy all
          // active criteria. Empty rows are considered non-matching so the
          // sheet only shows rows with concrete data for enum/range filters.
          ws.showRows(0, maxRows)
          if (active.length === 0) return

          for (let r = 0; r < maxRows; r++) {
            let hide = false
            for (const [colIdx, criterion] of active) {
              const v = ws.getRange(r, colIdx).getValue()
              if (!rowMatchesCriterion(v, criterion)) {
                hide = true
                break
              }
            }
            if (hide) ws.hideRows(r, 1)
          }
        },
        setRows(rows) {
          const ws = getSheet()
          if (!ws) return
          rows.forEach((row, r) => {
            row.forEach((val, c) => {
              ws.getRange(r, c).setValue(val ?? "")
            })
          })
        },
        getRowData(row) {
          const ws = getSheet()
          if (!ws) return []
          const maxCols = ws.getMaxColumns()
          const result: (string | number | null)[] = []
          for (let c = 0; c < maxCols; c++) {
            const v = ws.getRange(row, c).getValue()
            result.push(v == null ? null : (v as string | number))
          }
          return result
        },
        onSelectionChange(cb) {
          const handler = () => {
            const ws = getSheet()
            if (!ws) return
            const range = ws.getActiveRange()
            if (!range) return
            cb(range.getRow())
          }
          container.addEventListener("pointerup", handler)
          return () => container.removeEventListener("pointerup", handler)
        },
        getRowHeights() {
          const ws = getSheet()
          if (!ws) return []
          const max = ws.getMaxRows()
          const heights: number[] = []
          for (let r = 0; r < max; r++) heights.push(ws.getRowHeight(r))
          return heights
        },
        getMaxRows() {
          return getSheet()?.getMaxRows() ?? 0
        },
      }

      onApiRef.current?.(api)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }

    return () => {
      if (disposed) return
      disposed = true
      try {
        apiRef.current?.dispose()
      } finally {
        apiRef.current = null
      }
    }
     
  }, [workbookId])

  if (error) {
    return (
      <div
        className={
          "bg-card text-destructive rounded-lg border p-6 text-sm " +
          (className ?? "")
        }
      >
        <p className="font-medium">Univer 初始化失败</p>
        <p className="text-muted-foreground mt-1">{error}</p>
      </div>
    )
  }

  return <div ref={containerRef} className={className} />
}
