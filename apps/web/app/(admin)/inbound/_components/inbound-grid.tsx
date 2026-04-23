"use client"

import { useCallback, useId, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"

import {
  AllCommunityModule,
  ValidationModule,
  themeQuartz,
  type CellValueChangedEvent,
  type ColDef,
  type GridReadyEvent,
  type ValueGetterParams,
  type ValueSetterParams,
} from "ag-grid-community"
import { AG_GRID_LOCALE_CN } from "@ag-grid-community/locale"
import {
  AgGridProvider,
  AgGridReact,
  type CustomCellRendererProps,
} from "ag-grid-react"

import {
  IconColumnInsertRight,
  IconFilter,
  IconFilterOff,
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
import { PrintLabelDialog } from "./print-label-dialog"
import type { InboundRow } from "./types"

// cellRenderer 通过 grid 的 context 读回调，避免每次父组件 re-render 都
// 重新生成 columnDefs（columnDefs 一变 grid 会重建列，体验差）。
interface InboundGridContext {
  onPrintLabel: (row: InboundRow) => void
}

function ActionCell(
  params: CustomCellRendererProps<InboundRow, unknown, InboundGridContext>,
) {
  const row = params.data
  if (!row) return null
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 px-2"
      onClick={() => params.context?.onPrintLabel(row)}
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

export function InboundGrid() {
  const { resolvedTheme } = useTheme()
  const [rawRows, setRawRows] = useState<InboundRow[]>(INITIAL_ROWS)
  const [dynamicColumns, setDynamicColumns] = useState<DynamicCol[]>([])
  // form 的实时 state 放在 form 内部；外部这里只存“已提交”的筛选条件，
  // 保证只有用户点“查询”才会真正过滤 grid 数据。
  const [criteria, setCriteria] = useState<InboundCriteria>({})
  // 列头下一行的 floatingFilter 默认关掉，点按钮才展开——与上面整表级
  // 查询 form 错开职责：form 做常用字典/区间过滤,列筛属于“精细化微调”。
  const [showColumnFilter, setShowColumnFilter] = useState(false)
  // 打印标签弹窗的 row 与 open 状态由父级持有，dialog 做受控组件。
  const [printRow, setPrintRow] = useState<InboundRow | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  const addColumnNameId = useId()
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [addColumnName, setAddColumnName] = useState("")
  const [addColumnNameError, setAddColumnNameError] = useState("")

  const gridApiRef = useRef<GridReadyEvent<InboundRow>["api"] | null>(null)
  const handleGridReady = (e: GridReadyEvent<InboundRow>) => {
    gridApiRef.current = e.api
  }

  const openPrintLabel = useCallback((row: InboundRow) => {
    setPrintRow(row)
    setPrintOpen(true)
  }, [])

  // gridContext 保持引用稳定：只依赖 openPrintLabel 这个 useCallback，
  // 点击单元格时读到的永远是最新的 setter。
  const gridContext = useMemo<InboundGridContext>(
    () => ({ onPrintLabel: openPrintLabel }),
    [openPrintLabel],
  )

  function toggleColumnFilter() {
    setShowColumnFilter((prev) => {
      const next = !prev
      // 关闭列筛时顺手清掉残留的 filter model，避免看不见的筛选还生效。
      if (!next) gridApiRef.current?.setFilterModel(null)
      return next
    })
  }

  const rowData = useMemo(
    () => rawRows.filter((row) => matchesCriteria(row, criteria)),
    [rawRows, criteria],
  )

  const addRow = useCallback(() => {
    setRawRows((prev) => [...prev, emptyRowForDynamicCols(dynamicColumns)])
  }, [dynamicColumns])

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
      const dynamicColDefs: ColDef<InboundRow>[] = dynamicColumns.map(
        (col) => ({
          colId: col.id,
          headerName: col.headerName,
          minWidth: 100,
          flex: 0,
          sortable: true,
          filter: true,
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
          headerName: "入库单号",
          minWidth: 180,
          // pinned: "left",
        },
        { field: "sku", headerName: "SKU", minWidth: 120 },
        { field: "product", headerName: "商品名称", minWidth: 180, flex: 1 },
        { field: "batch", headerName: "批次号", minWidth: 140 },
        {
          field: "qty",
          headerName: "数量",
          minWidth: 100,
          filter: "agNumberColumnFilter",
          type: "numericColumn",
          cellEditor: "agNumberCellEditor",
          cellEditorParams: { min: 0, precision: 0 },
        },
        {
          field: "date",
          headerName: "入库日期",
          minWidth: 130,
          cellEditor: "agDateStringCellEditor",
          filter: "agDateColumnFilter",
        },
        {
          // 供应商 / 状态 这类字典型字段由上方 form 的下拉筛（值从字典管理配），
          // 列上的 floatingFilter 与字典本身会“打架”，所以这里显式关掉列内筛选；
          // 编辑态改用 select 下拉，避免用户敲出字典外的自由值。
          field: "supplier",
          headerName: "供应商",
          minWidth: 120,
          filter: false,
          floatingFilter: false,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: [...SUPPLIER_OPTIONS] },
        },
        {
          field: "status",
          headerName: "状态",
          minWidth: 110,
          filter: false,
          floatingFilter: false,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: { values: [...STATUS_OPTIONS] },
        },
        ...dynamicColDefs,
        // 操作列：按钮区，非数据编辑；保持不可编辑避免弹出文本编辑器盖住按钮。
        {
          headerName: "操作",
          colId: "actions",
          pinned: "right",
          minWidth: 120,
          maxWidth: 140,
          sortable: false,
          filter: false,
          editable: false,
          resizable: false,
          suppressMovable: true,
          cellRenderer: ActionCell,
        },
      ]
    },
    [dynamicColumns],
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: showColumnFilter,
      // 点一下进入编辑；操作列在列定义里单独 editable:false。
      editable: true,
    }),
    [showColumnFilter],
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
        />
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-muted-foreground text-xs">
            共 {rowData.length} 条
            {dynamicColumns.length > 0
              ? `（含 ${dynamicColumns.length} 个扩展列）`
              : null}
          </span>
          <div className="flex items-center gap-2">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleColumnFilter}
              aria-pressed={showColumnFilter}
            >
              {showColumnFilter ? (
                <IconFilterOff className="size-4" />
              ) : (
                <IconFilter className="size-4" />
              )}
              {showColumnFilter ? "关闭列筛选" : "开启列筛选"}
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
            onGridReady={handleGridReady}
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
