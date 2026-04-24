"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTheme } from "next-themes"

import {
  AllCommunityModule,
  ValidationModule,
  themeQuartz,
  type CellValueChangedEvent,
  type ColDef,
  type ValueGetterParams,
  type ValueSetterParams,
} from "ag-grid-community"
import { AG_GRID_LOCALE_CN } from "@ag-grid-community/locale"
import {
  AgGridProvider,
  AgGridReact,
  type CustomCellRendererProps,
  type CustomInnerHeaderProps,
} from "ag-grid-react"

import {
  IconArrowBackUp,
  IconColumnInsertRight,
  IconFileDownload,
  IconFileImport,
  IconPrinter,
  IconRowInsertTop,
} from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import {
  InboundFilterForm,
  STATUS_OPTIONS,
  SUPPLIER_OPTIONS,
  type InboundCriteria,
} from "./inbound-filter-form"
import { downloadInboundTemplate, parseInboundXlsx } from "./inbound-import"
import { PrintLabelDialog } from "./print-label-dialog"
import type { InboundRow } from "./types"

/** 表格模式：入库页用 inbound（打印标签），出库页用 outbound（标记返库）。 */
export type InboundGridVariant = "inbound" | "outbound"

// cellRenderer 通过 grid 的 context 读回调，避免每次父组件 re-render 都
// 重新生成 columnDefs（columnDefs 一变 grid 会重建列，体验差）。
interface InboundGridContext {
  variant: InboundGridVariant
  onPrintLabel: (row: InboundRow) => void
  onMarkReturned: (row: InboundRow) => void
  onRenameColumn: (colId: string, nextName: string) => void
}

// 通用可编辑表头：双击文字进入 input，Enter / 失焦提交，Esc 取消。
// 作为 innerHeaderComponent 使用，只替换文字部分，排序/筛选/菜单等图标仍由 grid 自带。
// 新列名通过 grid context 回写到父级 state；固定列走 headerOverrides，
// 动态列走 dynamicColumns，两边都按 colId 识别。
function EditableHeader(
  params: CustomInnerHeaderProps<InboundRow, InboundGridContext>,
) {
  const { displayName, column, context } = params
  const colId = column.getColId()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(displayName)

  useEffect(() => {
    if (!editing) setValue(displayName)
  }, [displayName, editing])

  const commit = useCallback(() => {
    const next = value.trim()
    setEditing(false)
    if (!next) {
      setValue(displayName)
      return
    }
    if (next !== displayName) context?.onRenameColumn(colId, next)
  }, [colId, context, displayName, value])

  if (editing) {
    return (
      <input
        autoFocus
        className="ring-ring h-6 w-full rounded border-0 bg-transparent px-1 text-sm outline-none ring-1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            setValue(displayName)
            setEditing(false)
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <span
      className="w-full cursor-text select-none truncate"
      title="双击修改列名"
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
    >
      {displayName}
    </span>
  )
}

function ActionCell(
  params: CustomCellRendererProps<InboundRow, unknown, InboundGridContext>,
) {
  const row = params.data
  const ctx = params.context
  if (!row || !ctx) return null

  // 出库模式：操作按钮是「返库」，已返库的行禁用并改文案，防止重复点击。
  if (ctx.variant === "outbound") {
    const returned = row.status === "已返库"
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2"
        disabled={returned}
        onClick={() => ctx.onMarkReturned(row)}
      >
        <IconArrowBackUp className="size-3.5" />
        {returned ? "已返库" : "返库"}
      </Button>
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 px-2"
      onClick={() => ctx.onPrintLabel(row)}
    >
      <IconPrinter className="size-3.5" />
      打印标签
    </Button>
  )
}

// v35 推荐的 Theming API：用 themeQuartz 定义 light/dark 两套 params，
// 通过设置容器上的 data-ag-theme-mode 切换，与 next-themes 同步。
const gridTheme = themeQuartz
  .withParams(
    {
      backgroundColor: "#ffffff",
      foregroundColor: "#0a0a0a",
      headerBackgroundColor: "#f5f5f5",
      headerTextColor: "#0a0a0a",
      borderColor: "#e5e7eb",
      oddRowBackgroundColor: "#fafafa",
      fontSize: 13,
      headerFontSize: 13,
      spacing: 6,
      browserColorScheme: "light",
    },
    "light",
  )
  .withParams(
    {
      backgroundColor: "#0a0a0a",
      foregroundColor: "#f5f5f5",
      headerBackgroundColor: "#171717",
      headerTextColor: "#f5f5f5",
      borderColor: "#262626",
      oddRowBackgroundColor: "#111111",
      fontSize: 13,
      headerFontSize: 13,
      spacing: 6,
      browserColorScheme: "dark",
    },
    "dark",
  )

// ValidationModule 只在开发态注册，生产 bundle 里不带它。
const modules = [
  AllCommunityModule,
  ...(process.env.NODE_ENV !== "production" ? [ValidationModule] : []),
]

const INITIAL_ROWS: InboundRow[] = [
  {
    id: "IN-20260422-001",
    sku: "SKU-10001",
    product: "全脂牛奶 1L",
    batch: "B20260422A",
    qty: 240,
    date: "2026-04-22",
    supplier: "华源",
    status: "已入库",
  },
  {
    id: "IN-20260422-002",
    sku: "SKU-10002",
    product: "苏打饼干 200g",
    batch: "B20260422B",
    qty: 120,
    date: "2026-04-22",
    supplier: "顺丰",
    status: "待检",
  },
  {
    id: "IN-20260421-003",
    sku: "SKU-10018",
    product: "有机鸡蛋 30枚",
    batch: "B20260421C",
    qty: 80,
    date: "2026-04-21",
    supplier: "京东物流",
    status: "已入库",
  },
  {
    id: "IN-20260420-004",
    sku: "SKU-10032",
    product: "蓝莓酱 250g",
    batch: "B20260420D",
    qty: 60,
    date: "2026-04-20",
    supplier: "华源",
    status: "在途",
  },
  {
    id: "IN-20260419-005",
    sku: "SKU-10045",
    product: "即食燕麦 500g",
    batch: "B20260419E",
    qty: 150,
    date: "2026-04-19",
    supplier: "顺丰",
    status: "已入库",
  },
]

function matchesCriteria(row: InboundRow, c: InboundCriteria): boolean {
  if (c.keyword) {
    const kw = c.keyword.toLowerCase()
    const extBlob = row.ext
      ? Object.values(row.ext)
          .join(" ")
          .toLowerCase()
      : ""
    const hit =
      row.id.toLowerCase().includes(kw) ||
      row.sku.toLowerCase().includes(kw) ||
      row.product.toLowerCase().includes(kw) ||
      extBlob.includes(kw)
    if (!hit) return false
  }
  if (c.supplier && row.supplier !== c.supplier) return false
  if (c.status && row.status !== c.status) return false
  // date 字段是 ISO YYYY-MM-DD，字符串字典序和日期顺序一致，可直接比较。
  if (c.dateFrom && row.date < c.dateFrom) return false
  if (c.dateTo && row.date > c.dateTo) return false
  return true
}

interface DynamicCol {
  id: string
  headerName: string
}

function createDynamicCol(headerName: string): DynamicCol {
  return {
    id: `dyn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    headerName,
  }
}

function emptyRowForDynamicCols(dyn: DynamicCol[]): InboundRow {
  const ext =
    dyn.length > 0 ? Object.fromEntries(dyn.map((c) => [c.id, ""])) : undefined
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: `IN-${Date.now()}`,
    sku: "",
    product: "",
    batch: "",
    qty: 0,
    date: today,
    supplier: "华源",
    status: "已入库",
    ext,
  }
}

export interface InboundGridProps {
  /**
   * 入库 / 出库切换。`outbound` 会把操作列按钮换成「返库」，
   * 并在点击时把对应行状态标记为「已返库」；其余列、筛选、编辑都完全共用。
   */
  variant?: InboundGridVariant
}

export function InboundGrid({ variant = "inbound" }: InboundGridProps = {}) {
  const { resolvedTheme } = useTheme()
  const [rawRows, setRawRows] = useState<InboundRow[]>(INITIAL_ROWS)
  const [dynamicColumns, setDynamicColumns] = useState<DynamicCol[]>([])
  // 固定列的表头自定义名称：双击编辑后覆盖到这里，key 是 colId（等于 field 或显式 colId）。
  const [headerOverrides, setHeaderOverrides] = useState<
    Record<string, string>
  >({})
  const dynamicColumnsRef = useRef<DynamicCol[]>(dynamicColumns)
  useEffect(() => {
    dynamicColumnsRef.current = dynamicColumns
  }, [dynamicColumns])
  // form 的实时 state 放在 form 内部；外部这里只存“已提交”的筛选条件，
  // 保证只有用户点“查询”才会真正过滤 grid 数据。
  const [criteria, setCriteria] = useState<InboundCriteria>({})
  // 打印标签弹窗的 row 与 open 状态由父级持有，dialog 做受控组件。
  const [printRow, setPrintRow] = useState<InboundRow | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  const addColumnNameId = useId()
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [addColumnName, setAddColumnName] = useState("")
  const [addColumnNameError, setAddColumnNameError] = useState("")

  // 导入 Excel：隐藏的 file input + 导入结果短暂提示。
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importReport, setImportReport] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const importTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openPrintLabel = useCallback((row: InboundRow) => {
    setPrintRow(row)
    setPrintOpen(true)
  }, [])

  const markReturned = useCallback((row: InboundRow) => {
    setRawRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, status: "已返库" as const } : r,
      ),
    )
  }, [])

  const renameColumn = useCallback((colId: string, nextName: string) => {
    // 动态列 / 固定列分两处存：
    //  - 动态列：dynamicColumns[].headerName 本身就是“当前名”
    //  - 固定列：headerOverrides[colId] 覆盖 colDef 里写死的初始名
    const isDynamic = dynamicColumnsRef.current.some((c) => c.id === colId)
    if (isDynamic) {
      setDynamicColumns((prev) =>
        prev.map((c) =>
          c.id === colId ? { ...c, headerName: nextName } : c,
        ),
      )
    } else {
      setHeaderOverrides((prev) => ({ ...prev, [colId]: nextName }))
    }
  }, [])

  // gridContext 保持引用稳定：只依赖 useCallback 出来的 handler，
  // 点击单元格 / 编辑表头时读到的永远是最新的 setter。
  const gridContext = useMemo<InboundGridContext>(
    () => ({
      variant,
      onPrintLabel: openPrintLabel,
      onMarkReturned: markReturned,
      onRenameColumn: renameColumn,
    }),
    [variant, openPrintLabel, markReturned, renameColumn],
  )

  const rowData = useMemo(
    () => rawRows.filter((row) => matchesCriteria(row, criteria)),
    [rawRows, criteria],
  )

  const addRow = useCallback(() => {
    setRawRows((prev) => [...prev, emptyRowForDynamicCols(dynamicColumns)])
  }, [dynamicColumns])

  const flashImportReport = useCallback(
    (report: { ok: boolean; message: string }) => {
      if (importTimerRef.current) clearTimeout(importTimerRef.current)
      setImportReport(report)
      importTimerRef.current = setTimeout(() => setImportReport(null), 6000)
    },
    [],
  )

  const triggerImport = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const downloadTemplate = useCallback(() => {
    try {
      downloadInboundTemplate({ dynamicColumns, variant })
    } catch (err) {
      console.error("[inbound:template] failed", err)
      flashImportReport({
        ok: false,
        message: `模板下载失败：${(err as Error).message || "未知错误"}`,
      })
    }
  }, [dynamicColumns, flashImportReport, variant])

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // 读完要重置 value，不然同一文件连续选两次 change 不会触发。
      e.target.value = ""
      if (!file) return
      try {
        const result = await parseInboundXlsx(file, {
          dynamicColumns,
          variant,
        })
        if (result.rows.length === 0) {
          flashImportReport({
            ok: false,
            message: `导入失败：未解析到任何数据行${
              result.warnings[0] ? `（${result.warnings[0]}）` : ""
            }`,
          })
          return
        }
        setRawRows((prev) => [...prev, ...result.rows])
        const base = `已追加 ${result.rows.length} 行`
        const tail = result.warnings.length
          ? `，${result.warnings.length} 条警告已在控制台输出`
          : ""
        if (result.warnings.length) {
          console.warn("[inbound:import] warnings", result.warnings)
        }
        flashImportReport({ ok: true, message: `${base}${tail}` })
      } catch (err) {
        console.error("[inbound:import] failed", err)
        flashImportReport({
          ok: false,
          message: `导入失败：${(err as Error).message || "未知错误"}`,
        })
      }
    },
    [dynamicColumns, flashImportReport, variant],
  )

  const onAddColumnDialogOpenChange = useCallback((open: boolean) => {
    setAddColumnOpen(open)
    if (!open) {
      setAddColumnName("")
      setAddColumnNameError("")
    }
  }, [])

  const openAddColumnDialog = useCallback(() => {
    setAddColumnName("")
    setAddColumnNameError("")
    setAddColumnOpen(true)
  }, [])

  const confirmAddColumn = useCallback(() => {
    const name = addColumnName.trim()
    if (!name) {
      setAddColumnNameError("请填写列名称")
      return
    }
    setAddColumnNameError("")
    setDynamicColumns((prev) => [...prev, createDynamicCol(name)])
    setAddColumnOpen(false)
    setAddColumnName("")
  }, [addColumnName])

  const columnDefs = useMemo<ColDef<InboundRow>[]>(
    () => {
      // 取某列当前的显示名：优先 headerOverrides[colId]，否则用 base。
      const h = (colId: string, base: string) =>
        headerOverrides[colId] ?? base
      // 所有数据列复用的表头扩展：innerHeaderComponent 只替换文字块，
      // 排序箭头 / 过滤器按钮等仍由 AG Grid 自带的外层 header 渲染。
      // 按 AG Grid 35 文档，innerHeaderComponent 需挂在 headerComponentParams 下。
      const editableHeader = {
        headerComponentParams: { innerHeaderComponent: EditableHeader },
        headerTooltip: "双击修改列名",
      } as const

      const dynamicColDefs: ColDef<InboundRow>[] = dynamicColumns.map(
        (col) => ({
          colId: col.id,
          headerName: col.headerName,
          ...editableHeader,
          minWidth: 100,
          flex: 0,
          resizable: true,
          valueGetter: (p: ValueGetterParams<InboundRow, InboundGridContext>) =>
            p.data?.ext?.[col.id] ?? "",
          valueSetter: (p: ValueSetterParams<InboundRow, InboundGridContext>) => {
            if (!p.data) return false
            const s = p.newValue != null ? String(p.newValue) : ""
            p.data.ext = { ...p.data.ext, [col.id]: s }
            return true
          },
        }),
      )
      return [
        {
          field: "id",
          headerName: h("id", "入库单号"),
          minWidth: 180,
          ...editableHeader,
          // pinned: "left",
        },
        {
          field: "sku",
          headerName: h("sku", "SKU"),
          minWidth: 120,
          ...editableHeader,
        },
        {
          field: "product",
          headerName: h("product", "商品名称"),
          minWidth: 180,
          flex: 1,
          ...editableHeader,
        },
        {
          field: "batch",
          headerName: h("batch", "批次号"),
          minWidth: 140,
          ...editableHeader,
        },
        {
          field: "qty",
          headerName: h("qty", "数量"),
          minWidth: 100,
          type: "numericColumn",
          cellEditor: "agNumberCellEditor",
          cellEditorParams: { min: 0, precision: 0 },
          ...editableHeader,
        },
        {
          field: "date",
          headerName: h("date", "入库日期"),
          minWidth: 130,
          cellEditor: "agDateStringCellEditor",
          ...editableHeader,
        },
        {
          // 供应商 / 状态 这类字典型字段：编辑态用 select 下拉，
          // 避免用户敲出字典外的自由值。列内筛选统一由 defaultColDef 关闭。
          field: "supplier",
          headerName: h("supplier", "供应商"),
          minWidth: 120,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: [...SUPPLIER_OPTIONS] },
          ...editableHeader,
        },
        {
          field: "status",
          headerName: h("status", "状态"),
          minWidth: 110,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: [...STATUS_OPTIONS] },
          ...editableHeader,
        },
        ...dynamicColDefs,
        // 操作列：单元格是按钮区，不可编辑；但表头仍支持双击改名。
        {
          headerName: h("actions", "操作"),
          colId: "actions",
          pinned: "right",
          minWidth: 120,
          maxWidth: 140,
          editable: false,
          resizable: false,
          suppressMovable: true,
          cellRenderer: ActionCell,
          ...editableHeader,
        },
      ]
    },
    [dynamicColumns, headerOverrides],
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      // 表头要承担“双击改名”的交互，排序 / 筛选按钮都会抢占事件，全部关掉；
      // 业务级过滤已经放在顶部的 InboundFilterForm 里了，列头保持干净。
      sortable: false,
      filter: false,
      resizable: true,
      // 点一下进入编辑；操作列在列定义里单独 editable:false。
      editable: true,
    }),
    [],
  )

  // 单元格编辑结束后的“模拟保存”。CellValueChangedEvent 会把当前行最新
  // 数据放在 event.data 上，这里就是接后端 PATCH 的接入点。
  const handleCellValueChanged = (event: CellValueChangedEvent<InboundRow>) => {
    const field = event.colDef.field as keyof InboundRow | undefined
    console.log("[inbound:save]", {
      rowId: event.data.id,
      field,
      oldValue: event.oldValue,
      newValue: event.newValue,
      row: event.data,
    })
  }

  // AG Grid 的暗黑模式由 data-ag-theme-mode 控制（挂在 grid 任意父元素），
  // 与 next-themes 的 resolvedTheme 对齐即可做到两边一起切；此组件通过
  // next/dynamic + ssr:false 加载，不存在 SSR 水合冲突，直接读 resolvedTheme 即可。
  const themeMode = resolvedTheme === "dark" ? "dark" : "light"

  return (
    <AgGridProvider modules={modules}>
      <div className="flex flex-col">
        <InboundFilterForm
          onSubmit={setCriteria}
          onReset={() => setCriteria({})}
          dateLabel={variant === "outbound" ? "出库日期" : "入库日期"}
        />
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              共 {rowData.length} 条
              {dynamicColumns.length > 0
                ? `（含 ${dynamicColumns.length} 个扩展列）`
                : null}
            </span>
            {importReport ? (
              <span
                className={
                  importReport.ok
                    ? "rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                }
              >
                {importReport.message}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
            >
              <IconFileDownload className="size-4" />
              下载导入模板
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={triggerImport}
            >
              <IconFileImport className="size-4" />
              导入 Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
            >
              <IconRowInsertTop className="size-4" />
              添加行
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openAddColumnDialog}
            >
              <IconColumnInsertRight className="size-4" />
              添加列
            </Button>
          </div>
        </div>
        <div className="h-[600px] w-full" data-ag-theme-mode={themeMode}>
          <AgGridReact<InboundRow>
            theme={gridTheme}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            context={gridContext}
            rowSelection={{ mode: "multiRow" }}
            localeText={AG_GRID_LOCALE_CN}
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={[10, 20, 50]}
            singleClickEdit
            stopEditingWhenCellsLoseFocus
            onCellValueChanged={handleCellValueChanged}
          />
        </div>
      </div>
      <Dialog open={addColumnOpen} onOpenChange={onAddColumnDialogOpenChange}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              confirmAddColumn()
            }}
          >
            <DialogHeader>
              <DialogTitle>添加扩展列</DialogTitle>
              <DialogDescription>输入在表头显示的列名称，可与其他列重名；内部 id 会单独生成。</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label htmlFor={addColumnNameId} className="text-foreground">
                列名称
              </Label>
              <Input
                id={addColumnNameId}
                className="mt-1.5"
                value={addColumnName}
                onChange={(e) => {
                  setAddColumnName(e.target.value)
                  if (addColumnNameError) setAddColumnNameError("")
                }}
                placeholder="例如：备注、仓位号"
                autoFocus
                autoComplete="off"
                aria-invalid={Boolean(addColumnNameError)}
                aria-describedby={
                  addColumnNameError ? "add-column-name-error" : undefined
                }
              />
              {addColumnNameError ? (
                <p
                  id="add-column-name-error"
                  className="text-destructive mt-1.5 text-xs"
                  role="alert"
                >
                  {addColumnNameError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onAddColumnDialogOpenChange(false)}
              >
                取消
              </Button>
              <Button type="submit">确定</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <PrintLabelDialog
        row={printRow}
        dynamicColumns={dynamicColumns}
        open={printOpen}
        onOpenChange={setPrintOpen}
      />
    </AgGridProvider>
  )
}
