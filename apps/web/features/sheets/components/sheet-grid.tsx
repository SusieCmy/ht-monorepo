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
import { useQueries, useQuery } from "@tanstack/react-query"

import {
  AllCommunityModule,
  ValidationModule,
  themeQuartz,
  type CellValueChangedEvent,
  type ColDef,
  type ValueFormatterParams,
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
  IconColumnInsertRight,
  IconDownload,
  IconFileImport,
  IconFileSpreadsheet,
  IconPrinter,
  IconRowInsertTop,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import type { ComponentType } from "react"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { options } from "@/lib/query"
import type { DictItem } from "@/lib/query/options/dicts"
import type {
  SheetColumn,
  SheetColumnType,
} from "@/lib/query/options/sheet-configs"
import type {
  SheetRow,
  SheetRowFilters,
} from "@/lib/query/options/sheet-rows"

import {
  useAppendSheetColumn,
  useDeleteSheetColumn,
  useRenameSheetColumn,
} from "../hooks/use-sheet-config-mutations"
import {
  useBulkCreateSheetRows,
  useCreateSheetRow,
  useDeleteSheetRow,
  useUpdateSheetRow,
} from "../hooks/use-sheet-row-mutations"
import {
  downloadSheetTemplate,
  exportSheetRows,
  parseSheetRowsFromXlsx,
  type SheetImportResult,
} from "../utils/sheet-excel"
import { useConfirm } from "@/components/feedback/confirm-provider"
import { useToast } from "@/components/feedback/toast-provider"

import {
  SheetFilterPanel,
  countActiveFilters,
  type FiltersState,
} from "./sheet-filter-panel"
import { SheetPrintLabelDialog } from "./sheet-print-label-dialog"

/**
 * 通用动态表格：
 *  - 列定义来自 `sheet-config/{id}`（可双击改名、末尾加列）
 *  - 行数据来自 `sheet-row-index?sheetId={id}`，支持增/改/删
 *  - 所有 mutation 走 `features/sheets/hooks` 里的乐观更新封装
 *
 * 对上层只暴露 `sheetId` 一个 prop；入库 / 出库 / 预警页都能复用同一份实现。
 */

/**
 * 外部注入的"每行一个自定义按钮"。
 *
 * 设计原则：
 *  - SheetGrid 保持领域无关，删除 / 打印条码是所有表都有的，写死；
 *  - 像"出库"、"返库"这种业务语义按钮，由使用方通过 `rowActions` 注入。
 *  - icon 传 `React 组件`（例如 `@tabler/icons-react` 里的图标），
 *    避免使用方再包一层。
 */
export interface SheetRowAction {
  id: string
  label: string
  icon?: ComponentType<{ className?: string }>
  /**
   * 按下按钮后执行的回调。可返回 Promise；期间按钮会被禁用。
   * 注意：这里不做"确认对话框"，需要的话请在 handler 里自己 confirm。
   */
  onClick: (row: SheetRow) => void | Promise<void>
  /** 条件禁用（例如已出库的行再点出库没意义）。 */
  disabled?: (row: SheetRow) => boolean
  /** 动态文案（例如"已出库"/"出库"切换）。 */
  getLabel?: (row: SheetRow) => string
  /** shadcn Button variant，默认 "outline"。 */
  variant?: "default" | "outline" | "ghost" | "destructive"
}

// 所有 cellRenderer / innerHeaderComponent 用到的回调都放在 AG Grid
// 的 context 里，避免 columnDefs 因为回调引用变化而整体重建。
interface SheetGridContext {
  onDeleteRow: (row: SheetRow) => void
  onPrintRow: (row: SheetRow) => void
  onRenameColumn: (columnId: string, nextName: string) => void
  /** 第二个参数 `columnName` 用来在顶层展示确认弹窗文案。 */
  onDeleteColumn: (columnId: string, columnName: string) => void
  /** 各字典类型下的 items，索引 key 是 dict_type.code。*/
  dictItemsByCode: Record<string, DictItem[]>
  /** 业务级按钮列表；渲染时会插在"打印条码 / 删除"前面。 */
  rowActions: SheetRowAction[]
  /** 只读模式：表头不能双击改名 / 不显示删列按钮。 */
  readOnly: boolean
  /** 隐藏内置"打印条码"。 */
  hidePrintRowAction: boolean
  /** 隐藏内置"删除"。 */
  hideDeleteRowAction: boolean
}

function EditableHeader(
  params: CustomInnerHeaderProps<SheetRow, SheetGridContext>,
) {
  const { displayName, column, context } = params
  const colId = column.getColId()
  const readOnly = context?.readOnly ?? false
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

  // 只读模式：直接返回一个纯文本 header，不支持任何交互（不双击、不删列）
  if (readOnly) {
    return (
      <div className="flex w-full items-center">
        <span className="flex-1 select-none truncate">{displayName}</span>
      </div>
    )
  }

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
    <div className="group flex w-full items-center gap-1">
      <span
        className="flex-1 cursor-text select-none truncate"
        title="双击修改列名"
        onDoubleClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        {displayName}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive invisible size-4 shrink-0 rounded opacity-0 transition group-hover:visible group-hover:opacity-100"
        title="删除该列"
        onClick={(e) => {
          e.stopPropagation()
          // 具体的确认弹窗由顶层的 handleDeleteColumn 统一处理（走 useConfirm）。
          context?.onDeleteColumn(colId, displayName)
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <IconX className="size-4" />
      </button>
    </div>
  )
}

/**
 * 操作列单元格：业务按钮（外部注入） + 打印条码 + 删除。
 *
 * 按钮顺序刻意固定：
 *   1. 业务按钮（从左到右按 `rowActions` 顺序）
 *   2. 打印条码（固定内置）
 *   3. 删除（永远在最右，破坏性操作）
 */
function RowActionCell(
  params: CustomCellRendererProps<SheetRow, unknown, SheetGridContext>,
) {
  const row = params.data
  const ctx = params.context
  if (!row || !ctx) return null

  return (
    <div className="flex items-center gap-1">
      {ctx.rowActions.map((action) => {
        const Icon = action.icon
        const disabled = action.disabled?.(row) ?? false
        const label = action.getLabel?.(row) ?? action.label
        return (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant={action.variant ?? "outline"}
            className="h-7 px-2"
            disabled={disabled}
            onClick={() => {
              void action.onClick(row)
            }}
            title={label}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {label}
          </Button>
        )
      })}
      {ctx.hidePrintRowAction ? null : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2"
          onClick={() => ctx.onPrintRow(row)}
          title="打印条码"
        >
          <IconPrinter className="size-3.5" />
          打印条码
        </Button>
      )}
      {ctx.hideDeleteRowAction ? null : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive h-7 px-2"
          onClick={() => ctx.onDeleteRow(row)}
          title="删除该行"
        >
          <IconTrash className="size-3.5" />
          删除
        </Button>
      )}
    </div>
  )
}

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

const modules = [
  AllCommunityModule,
  ...(process.env.NODE_ENV !== "production" ? [ValidationModule] : []),
]

/** 模块级常量：当 rowActions 未传时复用同一个空数组，避免 context 抖动。 */
const EMPTY_ROW_ACTIONS: SheetRowAction[] = []

export interface SheetGridProps {
  /** 对应 `sheet_config.id`，例如入库 = 1，出库 = 2，预警共用入库 = 1。 */
  sheetId: number
  /**
   * 每行的业务按钮（除"打印条码"和"删除"之外）。
   * 不传 / 空数组即表示没有额外按钮。
   *
   * 注意：rowActions 需要引用稳定（例如 useMemo 包一下），
   * 否则每次父组件 render 都会让列定义重新编译。
   */
  rowActions?: SheetRowAction[]
  /** 弹窗标题，默认"打印标签"；入库页可以传"入库标签"等。 */
  printLabelTitle?: string
  /**
   * 只读模式：预警页这类"派生视图"用。
   * 打开后：
   *  - 单元格不可编辑、列名不可双击改、不显示列尾删除按钮；
   *  - 工具栏不再显示"添加行/添加列/下载模板/导入 Excel"（保留导出）；
   *  - 内置"打印条码 / 删除"按钮是否展示由调用方另外通过
   *    `hidePrintRowAction` 或 `rowActions` 组合决定。
   */
  readOnly?: boolean
  /** 隐藏内置"打印条码"按钮（预警页用）。 */
  hidePrintRowAction?: boolean
  /** 隐藏内置"删除"按钮。默认保留 —— 即便只读视图也需要手动清理。 */
  hideDeleteRowAction?: boolean
  /** 隐藏整个查询筛选面板（预警页有固定条件，不让用户乱搞）。 */
  hideFilterPanel?: boolean
  /**
   * 强制附加到所有查询上的过滤条件：key = 列 id。
   *
   * 设计：forcedFilters 与用户在筛选面板里设置的 appliedFilters 合并后
   * 一起丢给后端，但用户那一份覆盖不了这里 —— 预警页的"库存 < 10"是
   * 硬性业务约束，不能被用户清掉。
   *
   * 同样需要引用稳定，内部用 JSON.stringify 记忆化。
   */
  forcedFilters?: SheetRowFilters
}

export function SheetGrid({
  sheetId,
  rowActions,
  printLabelTitle,
  readOnly = false,
  hidePrintRowAction = false,
  hideDeleteRowAction = false,
  hideFilterPanel = false,
  forcedFilters,
}: SheetGridProps) {
  const { resolvedTheme } = useTheme()
  const themeMode = resolvedTheme === "dark" ? "dark" : "light"
  const confirm = useConfirm()
  const toast = useToast()

  const configQuery = useQuery(options.sheetConfigs.sheetConfigDetailOptions(sheetId))
  // 字典类型下拉供"添加列 dialog"选择用。staleTime 较长，不会频繁拉。
  const dictTypesQuery = useQuery(options.dicts.dictTypeListOptions())

  const createRow = useCreateSheetRow(sheetId)
  const updateRow = useUpdateSheetRow(sheetId)
  const deleteRow = useDeleteSheetRow(sheetId)
  const bulkCreateRows = useBulkCreateSheetRows(sheetId)
  const renameColumn = useRenameSheetColumn(sheetId)
  const appendColumn = useAppendSheetColumn(sheetId)
  const deleteColumn = useDeleteSheetColumn(sheetId)

  // 上次 PATCH 失败时，组件把单元格回滚到 oldValue 之前要抑制一次
  // onCellValueChanged，避免死循环。
  const suppressNextCellChangeRef = useRef(false)

  const addColumnNameId = useId()
  const addColumnTypeId = useId()
  const addColumnDictId = useId()
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [addColumnName, setAddColumnName] = useState("")
  const [addColumnNameError, setAddColumnNameError] = useState("")
  const [addColumnType, setAddColumnType] = useState<SheetColumnType>("text")
  const [addColumnDictCode, setAddColumnDictCode] = useState("")
  const [addColumnDictError, setAddColumnDictError] = useState("")

  // 打印条码弹窗：row 持有被点击的当前行，open 是受控状态。
  const [printRow, setPrintRow] = useState<SheetRow | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  // Excel 导入：用隐藏 file input + ref 触发选择文件；导入完成后把
  // 解析结果落到 importResult，渲染一个对话框展示统计 + 告警。
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importResult, setImportResult] = useState<
    (SheetImportResult & { created: number }) | null
  >(null)
  const [importResultOpen, setImportResultOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const columns = configQuery.data?.columns ?? []

  // 查询：draft 是正在编辑中的表单值，applied 是"查询"按钮按下那一刻
  // 的快照。appliedFilters 会参与 queryKey，一旦变化 TanStack Query
  // 会重新请求后端，真正的过滤在 MariaDB 侧完成（JSON_EXTRACT）。
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<FiltersState>({})
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>({})

  // 合并规则：forcedFilters 里每列的每个字段都强制生效；如果用户在筛选
  // 面板里对同一列设置了同名字段，以 forced 为准（业务约束不可覆盖）。
  // 用 JSON.stringify 做 poor-man memo —— forcedFilters 通常是小对象，
  // 成本几乎可忽略，但能吃下调用方没 useMemo 的情况。
  const forcedKey = forcedFilters ? JSON.stringify(forcedFilters) : ""
  const effectiveFilters = useMemo<SheetRowFilters>(() => {
    const base = appliedFilters as unknown as SheetRowFilters
    if (!forcedFilters) return base
    const out: SheetRowFilters = { ...base }
    for (const [colId, forced] of Object.entries(forcedFilters)) {
      out[colId] = { ...(out[colId] ?? {}), ...forced }
    }
    return out
    // forcedKey 已经编码了 forcedFilters 的结构化值，不需要 forcedFilters 作依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters, forcedKey])

  // FiltersState 与 SheetRowFilters 字段完全相同，只是 options/sheet-rows 的
  // 类型额外带了 SerializableObject 的索引签名（给 queryKey 用）。
  // 这里做一次结构断言，比每个字段手搓一遍更稳。
  const rowsQuery = useQuery(
    options.sheetRows.sheetRowListOptions({
      sheetId,
      filters: effectiveFilters,
    }),
  )
  const rows = rowsQuery.data ?? []

  // 收集表里用到的所有字典 code，并一次性并发拉取它们各自的 items。
  // 返回一个 Map<typeCode, DictItem[]>，给单元格编辑器/展示用。
  const dictCodes = useMemo(() => {
    const set = new Set<string>()
    for (const col of columns) {
      if (col.type === "dict" && col.dictTypeCode) set.add(col.dictTypeCode)
    }
    return [...set]
  }, [columns])

  const dictItemQueries = useQueries({
    queries: dictCodes.map((typeCode) =>
      options.dicts.dictItemListOptions({ typeCode }),
    ),
  })

  const dictItemsByCode = useMemo(() => {
    const map: Record<string, DictItem[]> = {}
    dictCodes.forEach((code, i) => {
      map[code] = dictItemQueries[i]?.data ?? []
    })
    return map
  }, [dictCodes, dictItemQueries])

  // 仅用于在 header 上展示 badge 数字，真正的过滤交给后端。
  const activeFilterCount = useMemo(
    () => countActiveFilters(appliedFilters, columns),
    [appliedFilters, columns],
  )

  const handleResetFilters = useCallback(() => {
    setDraftFilters({})
    setAppliedFilters({})
  }, [])

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters(draftFilters)
  }, [draftFilters])

  // 列发生变化时（加/删列），把那列的筛选条件一并清掉，避免脏数据。
  useEffect(() => {
    const colIds = new Set(columns.map((c) => c.id))
    setDraftFilters((prev) => {
      let changed = false
      const next: FiltersState = {}
      for (const [k, v] of Object.entries(prev)) {
        if (colIds.has(k)) next[k] = v
        else changed = true
      }
      return changed ? next : prev
    })
    setAppliedFilters((prev) => {
      let changed = false
      const next: FiltersState = {}
      for (const [k, v] of Object.entries(prev)) {
        if (colIds.has(k)) next[k] = v
        else changed = true
      }
      return changed ? next : prev
    })
  }, [columns])

  const handleDeleteRow = useCallback(
    async (row: SheetRow) => {
      const ok = await confirm({
        title: "删除该行数据？",
        description: (
          <>
            将永久删除行号 <span className="font-mono">{row.id}</span>
            ，操作不可恢复。
          </>
        ),
        confirmText: "删除",
        tone: "destructive",
      })
      if (!ok) return
      deleteRow.mutate(
        { id: row.id, sheetId },
        {
          onSuccess: () => toast.success({ title: "已删除该行" }),
          onError: (err) =>
            toast.error({
              title: "删除失败",
              description: err instanceof Error ? err.message : "未知错误",
            }),
        },
      )
    },
    [confirm, deleteRow, sheetId, toast],
  )

  const handlePrintRow = useCallback((row: SheetRow) => {
    setPrintRow(row)
    setPrintOpen(true)
  }, [])

  const handleRenameColumn = useCallback(
    (columnId: string, nextName: string) => {
      renameColumn.mutate(
        { columnId, nextName },
        {
          onError: (err) =>
            toast.error({
              title: "列名修改失败",
              description: err instanceof Error ? err.message : "未知错误",
            }),
        },
      )
    },
    [renameColumn, toast],
  )

  const handleDeleteColumn = useCallback(
    async (columnId: string, columnName: string) => {
      const ok = await confirm({
        title: "删除这一列？",
        description: (
          <>
            将删除列 <span className="font-semibold">「{columnName}」</span>
            ，该列下所有行的该字段数据都会一并清除，操作不可恢复。
          </>
        ),
        confirmText: "删除列",
        tone: "destructive",
      })
      if (!ok) return
      deleteColumn.mutate(
        { columnId },
        {
          onSuccess: () => toast.success({ title: `已删除列「${columnName}」` }),
          onError: (err) =>
            toast.error({
              title: "删除列失败",
              description: err instanceof Error ? err.message : "未知错误",
            }),
        },
      )
    },
    [confirm, deleteColumn, toast],
  )

  // rowActions 在上游通常是新数组引用，这里 memo 一下，避免上游忘了
  // stable 引用就把列定义带崩。空数组 `[]` 用固定常量消除引用抖动。
  const stableRowActions = useMemo<SheetRowAction[]>(
    () => rowActions ?? EMPTY_ROW_ACTIONS,
    [rowActions],
  )

  const gridContext = useMemo<SheetGridContext>(
    () => ({
      onDeleteRow: handleDeleteRow,
      onPrintRow: handlePrintRow,
      onRenameColumn: handleRenameColumn,
      onDeleteColumn: handleDeleteColumn,
      dictItemsByCode,
      rowActions: stableRowActions,
      readOnly,
      hidePrintRowAction,
      hideDeleteRowAction,
    }),
    [
      handleDeleteRow,
      handlePrintRow,
      handleRenameColumn,
      handleDeleteColumn,
      dictItemsByCode,
      stableRowActions,
      readOnly,
      hidePrintRowAction,
      hideDeleteRowAction,
    ],
  )

  const columnDefs = useMemo<ColDef<SheetRow>[]>(() => {
    const editableHeader = {
      headerComponentParams: { innerHeaderComponent: EditableHeader },
      headerTooltip: "双击修改列名",
    } as const

    // 固定只读 ID 列：
    //  - 值来自 `sheet_row_index.id`（数据库主键），不受 sheet_config 动态列影响；
    //  - editable 显式 false，即使 defaultColDef.editable=true 也不会被覆盖；
    //  - 不挂 EditableHeader，因此表头也不能双击改名；
    //  - pinned:"left" + suppressMovable，确保无论怎么调列顺序，ID 永远在最左；
    //  - 打印弹窗里的条形码默认值也取 `row.id`，扫码出库时拿到的就是这一列的值。
    const idCol: ColDef<SheetRow> = {
      colId: "__id",
      headerName: "ID",
      headerTooltip: "行主键；系统自动生成，不可编辑，条形码 / 扫码出库均以此为准",
      pinned: "left",
      minWidth: 80,
      maxWidth: 120,
      editable: false,
      resizable: true,
      suppressMovable: true,
      // 新行在拿到真实 id 之前是负数占位（见 useCreateSheetRow.tempRowId），
      // 给用户显示"新增中…"而不是 -173..... 这种看着像 bug 的值。
      valueGetter: (p: ValueGetterParams<SheetRow, SheetGridContext>) => {
        const id = p.data?.id
        if (id === undefined || id === null) return ""
        return id < 0 ? "新增中…" : id
      },
      cellClass: "text-muted-foreground font-mono",
    }

    const dataCols: ColDef<SheetRow>[] = columns.map((col: SheetColumn) => {
      const base: ColDef<SheetRow> = {
        colId: col.id,
        headerName: col.name,
        ...editableHeader,
        minWidth: 120,
        flex: 1,
        valueGetter: (p: ValueGetterParams<SheetRow, SheetGridContext>) =>
          p.data?.values?.[col.id] ?? "",
        valueSetter: (p: ValueSetterParams<SheetRow, SheetGridContext>) => {
          if (!p.data) return false
          const s = p.newValue != null ? String(p.newValue) : ""
          if (p.data.values?.[col.id] === s) return false
          p.data.values = { ...p.data.values, [col.id]: s }
          return true
        },
      }
      if (col.type === "number") {
        base.type = "numericColumn"
        base.cellEditor = "agNumberCellEditor"
        base.cellEditorParams = { precision: 2 }
      } else if (col.type === "date") {
        base.cellEditor = "agDateStringCellEditor"
      } else if (col.type === "dict" && col.dictTypeCode) {
        const dictTypeCode = col.dictTypeCode
        // 存取约定：dict 列直接保存 label（字典项的中文展示值）。
        // 好处：下拉里看到什么、表格存什么、展示什么都是一致的。
        // 坏处：字典项 rename 后已有行不会自动同步；后续如需
        //   稳定 value 引用，再升级为自定义 cellEditor。
        base.cellEditor = "agSelectCellEditor"
        base.cellEditorParams = (p: { context?: SheetGridContext }) => {
          const items = p.context?.dictItemsByCode?.[dictTypeCode] ?? []
          return {
            values: items.map((it) => it.label),
            valueListMaxHeight: 240,
          }
        }
        // 空值时显示占位符，提示"未选择"。
        base.valueFormatter = (p: ValueFormatterParams<SheetRow, string>) =>
          p.value ? String(p.value) : ""
      }
      return base
    })

    // 操作列宽度根据按钮数量估算：业务按钮数 + 打印条码(可隐藏) + 删除(可隐藏)。
    // 每个按钮按 ~86px 宽 + 间距算，够常见 2~4 个按钮展开，再多就出滚动条。
    const builtinCount =
      (hidePrintRowAction ? 0 : 1) + (hideDeleteRowAction ? 0 : 1)
    const actionCount = (rowActions?.length ?? 0) + builtinCount
    const actionColWidth = Math.max(120, actionCount * 86)

    return [
      idCol,
      ...dataCols,
      {
        headerName: "操作",
        colId: "__actions",
        pinned: "right",
        minWidth: actionColWidth,
        editable: false,
        resizable: false,
        suppressMovable: true,
        cellRenderer: RowActionCell,
      },
    ]
  }, [columns, rowActions, hidePrintRowAction, hideDeleteRowAction])

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: false,
      filter: false,
      resizable: true,
      editable: !readOnly,
    }),
    [readOnly],
  )

  // 单元格编辑结束：把单列变更拼成 { [colId]: newValue } 发给后端。
  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent<SheetRow>) => {
      if (suppressNextCellChangeRef.current) {
        suppressNextCellChangeRef.current = false
        return
      }
      const row = event.data
      const colId = event.colDef.colId ?? (event.colDef as { field?: string }).field
      if (!row || !colId) return
      const newValue = event.newValue == null ? "" : String(event.newValue)

      // 新增行还没拿到真实 id 前（id < 0），不要发 PATCH，等 create 回来后
      // onSettled 会拉一次列表，再在真实数据基础上继续改。
      if (row.id <= 0) return

      updateRow.mutate(
        { id: row.id, sheetId, values: { [colId]: newValue } },
        {
          onError: () => {
            // 失败时把单元格视觉回滚到 oldValue，避免和后端不一致。
            suppressNextCellChangeRef.current = true
            event.node.setDataValue(colId, event.oldValue)
          },
        },
      )
    },
    [updateRow, sheetId],
  )

  const handleAddRow = useCallback(() => {
    const emptyValues: Record<string, string> = {}
    for (const col of columns) emptyValues[col.id] = ""
    createRow.mutate({ sheetId, values: emptyValues })
  }, [columns, createRow, sheetId])

  const handleDownloadTemplate = useCallback(() => {
    const config = configQuery.data
    if (!config) return
    // 模板里的 dict 列示例取字典的第一个 item，传 dictItemsByCode 进去。
    downloadSheetTemplate(config, { dictItemsByCode })
  }, [configQuery.data, dictItemsByCode])

  const handleExport = useCallback(() => {
    const config = configQuery.data
    if (!config) return
    // 导出当前 rowsQuery 的数据 —— 若用户有筛选条件，导出的就是筛选后的结果，
    // 这符合大多数用户的直觉（"我看到什么就导出什么"）。
    exportSheetRows(config, rows, { dictItemsByCode })
  }, [configQuery.data, rows, dictItemsByCode])

  const handleImportClick = useCallback(() => {
    // 每次点击前清空 value，否则选同一个文件不会触发 change。
    if (fileInputRef.current) fileInputRef.current.value = ""
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setImportError(null)
      try {
        const parsed = await parseSheetRowsFromXlsx(file, columns)
        if (parsed.rows.length === 0) {
          // 没有可导入的数据时也把结果弹出来，让用户看见"识别到 0 行 + unknownHeaders"，
          // 比只丢一个"无数据"提示更有助于他修表头。
          setImportResult({ ...parsed, created: 0 })
          setImportResultOpen(true)
          return
        }
        const res = await bulkCreateRows.mutateAsync(parsed.rows)
        setImportResult({ ...parsed, created: res.created })
        setImportResultOpen(true)
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : "导入失败，请检查 Excel 格式",
        )
        setImportResultOpen(true)
      }
    },
    [bulkCreateRows, columns],
  )

  const onAddColumnDialogOpenChange = useCallback((open: boolean) => {
    setAddColumnOpen(open)
    if (!open) {
      setAddColumnName("")
      setAddColumnNameError("")
      setAddColumnType("text")
      setAddColumnDictCode("")
      setAddColumnDictError("")
    }
  }, [])

  const openAddColumnDialog = useCallback(() => {
    setAddColumnName("")
    setAddColumnNameError("")
    setAddColumnType("text")
    setAddColumnDictCode("")
    setAddColumnDictError("")
    setAddColumnOpen(true)
  }, [])

  const confirmAddColumn = useCallback(() => {
    const name = addColumnName.trim()
    let hasError = false
    if (!name) {
      setAddColumnNameError("请填写列名称")
      hasError = true
    }
    if (addColumnType === "dict" && !addColumnDictCode) {
      setAddColumnDictError("请选择字典类型")
      hasError = true
    }
    if (hasError) return

    appendColumn.mutate(
      {
        name,
        type: addColumnType,
        dictTypeCode:
          addColumnType === "dict" ? addColumnDictCode : undefined,
      },
      {
        onSuccess: () => {
          setAddColumnOpen(false)
          setAddColumnName("")
          setAddColumnType("text")
          setAddColumnDictCode("")
        },
      },
    )
  }, [
    addColumnDictCode,
    addColumnName,
    addColumnType,
    appendColumn,
  ])

  const sheetName = configQuery.data?.name ?? ""
  const isConfigLoading = configQuery.isPending
  const isRowsLoading = rowsQuery.isPending
  const configError = configQuery.isError ? configQuery.error : null
  const rowsError = rowsQuery.isError ? rowsQuery.error : null
  const mutationPending =
    createRow.isPending ||
    updateRow.isPending ||
    deleteRow.isPending ||
    renameColumn.isPending ||
    appendColumn.isPending ||
    deleteColumn.isPending

  return (
    <AgGridProvider modules={modules}>
      <div className="flex flex-col">
        {hideFilterPanel ? null : (
          <SheetFilterPanel
            columns={columns}
            dictItemsByCode={dictItemsByCode}
            draft={draftFilters}
            onDraftChange={setDraftFilters}
            applied={appliedFilters}
            onSubmit={handleApplyFilters}
            onReset={handleResetFilters}
            open={filterOpen}
            onOpenChange={setFilterOpen}
          />
        )}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {sheetName ? `${sheetName}：` : ""}
              {activeFilterCount > 0
                ? `筛选命中 ${rows.length} 条`
                : `共 ${rows.length} 条`}
              {columns.length > 0 ? `，${columns.length} 列` : null}
            </span>
            {mutationPending ? (
              <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
                正在同步…
              </span>
            ) : null}
            {configError ? (
              <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                表格配置加载失败：{configError.message}
              </span>
            ) : null}
            {rowsError ? (
              <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                行数据加载失败：{rowsError.message}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {readOnly ? null : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  disabled={isConfigLoading || columns.length === 0}
                  title="按当前表头生成 Excel 模板（含一行示例）"
                >
                  <IconFileSpreadsheet className="size-4" />
                  下载模板
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleImportClick}
                  disabled={
                    isConfigLoading ||
                    columns.length === 0 ||
                    bulkCreateRows.isPending
                  }
                  title="上传按模板填写好的 Excel，追加到当前表格"
                >
                  <IconFileImport className="size-4" />
                  {bulkCreateRows.isPending ? "导入中…" : "导入 Excel"}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isConfigLoading || rows.length === 0}
              title="导出当前表格数据（若设置了筛选条件则只导出命中行）"
            >
              <IconDownload className="size-4" />
              导出
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            {readOnly ? null : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRow}
                  disabled={isConfigLoading || columns.length === 0}
                >
                  <IconRowInsertTop className="size-4" />
                  添加行
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openAddColumnDialog}
                  disabled={isConfigLoading}
                >
                  <IconColumnInsertRight className="size-4" />
                  添加列
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="h-[600px] w-full" data-ag-theme-mode={themeMode}>
          <AgGridReact<SheetRow>
            theme={gridTheme}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            context={gridContext}
            getRowId={(p) => String(p.data.id)}
            rowSelection={{ mode: "multiRow" }}
            localeText={AG_GRID_LOCALE_CN}
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={[10, 20, 50]}
            singleClickEdit
            stopEditingWhenCellsLoseFocus
            loading={isConfigLoading || isRowsLoading}
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
              <DialogTitle>添加列</DialogTitle>
              <DialogDescription>
                选择列的数据类型，保存后会同步到后端 sheet-config。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
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

              <div>
                <Label htmlFor={addColumnTypeId} className="text-foreground">
                  列类型
                </Label>
                <Select
                  value={addColumnType}
                  onValueChange={(v) => {
                    setAddColumnType(v as SheetColumnType)
                    if (v !== "dict") {
                      setAddColumnDictCode("")
                      setAddColumnDictError("")
                    }
                  }}
                >
                  <SelectTrigger id={addColumnTypeId} className="mt-1.5 w-full">
                    <SelectValue placeholder="选择列类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">文本</SelectItem>
                    <SelectItem value="number">数值</SelectItem>
                    <SelectItem value="date">日期</SelectItem>
                    <SelectItem value="dict">类型（字典）</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {addColumnType === "dict" ? (
                <div>
                  <Label htmlFor={addColumnDictId} className="text-foreground">
                    字典类型
                  </Label>
                  <Select
                    value={addColumnDictCode}
                    onValueChange={(v) => {
                      setAddColumnDictCode(v)
                      if (addColumnDictError) setAddColumnDictError("")
                    }}
                  >
                    <SelectTrigger
                      id={addColumnDictId}
                      className="mt-1.5 w-full"
                      aria-invalid={Boolean(addColumnDictError)}
                    >
                      <SelectValue
                        placeholder={
                          dictTypesQuery.isPending
                            ? "加载中…"
                            : "选择字典类型"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(dictTypesQuery.data ?? []).map((t) => (
                        <SelectItem key={t.code} value={t.code}>
                          {t.name}（{t.code}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {addColumnDictError ? (
                    <p
                      className="text-destructive mt-1.5 text-xs"
                      role="alert"
                    >
                      {addColumnDictError}
                    </p>
                  ) : null}
                  {dictTypesQuery.isError ? (
                    <p
                      className="text-destructive mt-1.5 text-xs"
                      role="alert"
                    >
                      字典类型加载失败：{dictTypesQuery.error.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onAddColumnDialogOpenChange(false)}
                disabled={appendColumn.isPending}
              >
                取消
              </Button>
              <Button type="submit" disabled={appendColumn.isPending}>
                {appendColumn.isPending ? "保存中…" : "确定"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SheetPrintLabelDialog
        row={printRow}
        columns={columns}
        dictItemsByCode={dictItemsByCode}
        open={printOpen}
        onOpenChange={setPrintOpen}
        title={printLabelTitle ?? "打印标签"}
      />
      <Dialog
        open={importResultOpen}
        onOpenChange={(open) => {
          setImportResultOpen(open)
          if (!open) {
            setImportResult(null)
            setImportError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>导入结果</DialogTitle>
            <DialogDescription>
              {importError
                ? "导入失败，请检查 Excel 文件格式或联系管理员。"
                : "已按当前表头读取 Excel，匹配到的列会写入表格。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            {importError ? (
              <p className="text-destructive">{importError}</p>
            ) : importResult ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Excel 数据行</span>
                  <span>{importResult.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">成功写入</span>
                  <span className="font-medium text-emerald-600">
                    {importResult.created}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">识别到的列</span>
                  <span>
                    {importResult.matchedColumns.length > 0
                      ? importResult.matchedColumns
                          .map((c) => c.name || c.id)
                          .join("、")
                      : "—"}
                  </span>
                </div>
                {importResult.unknownHeaders.length > 0 ? (
                  <div className="text-amber-600 dark:text-amber-400">
                    以下列在当前表头里找不到，已忽略：
                    {importResult.unknownHeaders.join("、")}
                  </div>
                ) : null}
                {importResult.warnings.length > 0 ? (
                  <ul className="max-h-40 list-disc overflow-auto pl-5 text-xs text-amber-600 dark:text-amber-400">
                    {importResult.warnings.slice(0, 20).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {importResult.warnings.length > 20 ? (
                      <li>…以及另外 {importResult.warnings.length - 20} 条</li>
                    ) : null}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setImportResultOpen(false)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AgGridProvider>
  )
}
