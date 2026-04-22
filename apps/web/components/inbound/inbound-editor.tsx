"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import { IconFilter, IconPencil, IconPlus, IconX } from "@tabler/icons-react"
import { Popover } from "radix-ui"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import type {
  Column,
  ColumnType,
  FilterCriterion,
  Filters,
  UniverSheetApi,
} from "@/components/univer/univer-sheet"
import { UniverSheetLazy } from "@/components/univer/univer-sheet-lazy"

const TYPE_OPTIONS: Array<{ value: ColumnType; label: string }> = [
  { value: "text", label: "文本" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "select", label: "下拉" },
]

const DEFAULT_COLUMNS: Column[] = [
  { id: "c-sku", name: "SKU", type: "text", filterable: false },
  { id: "c-product", name: "商品名称", type: "text", filterable: false },
  { id: "c-batch", name: "批次号", type: "text", filterable: false },
  { id: "c-qty", name: "数量", type: "number", filterable: true },
  { id: "c-date", name: "入库日期", type: "date", filterable: true },
  {
    id: "c-supplier",
    name: "供应商",
    type: "select",
    filterable: true,
    filterOptions: ["华源", "顺丰", "京东物流"],
  },
]

// 每种 column type 对应的筛选 criterion 判别式；edit 面板和筛选条都靠它分流。
type CriterionKind = FilterCriterion["kind"]

function expectedKind(col: Column): CriterionKind {
  switch (col.type) {
    case "number":
      return "numberRange"
    case "date":
      return "dateRange"
    default:
      return "enum"
  }
}

// enum 以外（number/date）勾选"可筛选"即可使用；enum 还需有预设值才真正可用。
function isFilterUsable(col: Column): boolean {
  if (!col.filterable) return false
  if (col.type === "number" || col.type === "date") return true
  return (col.filterOptions?.length ?? 0) > 0
}

function typeLabel(type: ColumnType) {
  return TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

function randomId() {
  return `c-${Math.random().toString(36).slice(2, 10)}`
}

function parseOptions(raw: string): string[] {
  return raw
    .split(/[\n,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function InboundEditor() {
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS)
  const [filters, setFilters] = useState<Filters>({})

  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<ColumnType>("text")
  const [newFilterable, setNewFilterable] = useState(false)
  const [newFilterRaw, setNewFilterRaw] = useState("")

  const apiRef = useRef<UniverSheetApi | null>(null)
  const initialColumnsRef = useRef(columns)

  const handleApi = useCallback((api: UniverSheetApi) => {
    apiRef.current = api
    apiRef.current?.applyFilters(filters)
    // NOTE: intentionally read-once; ref captured via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trimmedNew = newName.trim()
  const nameTaken = useMemo(
    () => columns.some((c) => c.name === trimmedNew),
    [columns, trimmedNew],
  )
  const parsedNewOptions = useMemo(
    () => parseOptions(newFilterRaw),
    [newFilterRaw],
  )
  const newNeedsOptions =
    newFilterable && (newType === "text" || newType === "select")
  const canAdd =
    trimmedNew.length > 0 &&
    !nameTaken &&
    (!newNeedsOptions || parsedNewOptions.length > 0)

  function syncAll(nextCols: Column[], nextFilters: Filters) {
    apiRef.current?.syncColumns(nextCols)
    apiRef.current?.applyFilters(nextFilters)
  }

  // 列重排/增删/类型变化后重新对齐 filter。按 column id 保留选择；
  // 若列已不可筛选，或 criterion 的 kind 与新列类型不匹配，或 enum 的值
  // 不再在下拉里，就丢掉。
  function realignFilters(
    nextCols: Column[],
    prevFilters: Filters,
    prevCols: Column[],
  ): Filters {
    const byId: Record<string, FilterCriterion> = {}
    for (const [idxStr, criterion] of Object.entries(prevFilters)) {
      if (!criterion) continue
      const col = prevCols[Number(idxStr)]
      if (col) byId[col.id] = criterion
    }
    const next: Filters = {}
    nextCols.forEach((c, i) => {
      const prev = byId[c.id]
      if (!prev || !c.filterable) return
      if (prev.kind !== expectedKind(c)) return
      if (prev.kind === "enum") {
        if (!c.filterOptions?.includes(prev.value)) return
      }
      next[i] = prev
    })
    return next
  }

  function addColumn() {
    if (!canAdd) return
    const col: Column = {
      id: randomId(),
      name: trimmedNew,
      type: newType,
      filterable: newFilterable,
      filterOptions: newNeedsOptions ? parsedNewOptions : undefined,
    }
    const next = [...columns, col]
    setColumns(next)
    initialColumnsRef.current = next
    syncAll(next, filters)

    setNewName("")
    setNewType("text")
    setNewFilterable(false)
    setNewFilterRaw("")
  }

  function removeColumn(id: string) {
    const prev = columns
    const next = prev.filter((c) => c.id !== id)
    const nextFilters = realignFilters(next, filters, prev)
    setColumns(next)
    setFilters(nextFilters)
    initialColumnsRef.current = next
    syncAll(next, nextFilters)
  }

  function updateColumn(id: string, patch: Partial<Column>) {
    const prev = columns
    const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    const nextFilters = realignFilters(next, filters, prev)
    setColumns(next)
    setFilters(nextFilters)
    initialColumnsRef.current = next
    syncAll(next, nextFilters)
  }

  function setCriterion(colIdx: number, criterion: FilterCriterion | null) {
    const nextFilters = { ...filters, [colIdx]: criterion }
    setFilters(nextFilters)
    apiRef.current?.applyFilters(nextFilters)
  }

  function clearAllFilters() {
    const cleared: Filters = {}
    setFilters(cleared)
    apiRef.current?.applyFilters(cleared)
  }

  const filterableEntries = columns
    .map((c, i) => ({ col: c, idx: i }))
    .filter((e) => isFilterUsable(e.col))

  const hasActiveFilter = Object.values(filters).some(
    (c) => c && isCriterionActiveLocal(c),
  )

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <div className="flex flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">入库单录入（Univer）</span>
          <span className="text-muted-foreground text-xs">
            顶部菜单可打开 MCP 配置 · 支持 AI 远程操作
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {columns.map((col) => (
            <ColumnChip
              key={col.id}
              col={col}
              existingNames={columns
                .filter((c) => c.id !== col.id)
                .map((c) => c.name)}
              onChange={(patch) => updateColumn(col.id, patch)}
              onRemove={() => removeColumn(col.id)}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-start">
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !newNeedsOptions) addColumn()
              }}
              placeholder="新列名"
              className="h-8 w-44"
              aria-invalid={nameTaken || undefined}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as ColumnType)}
              className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={newFilterable}
                onChange={(e) => setNewFilterable(e.target.checked)}
                className="size-4"
              />
              可筛选
            </label>
          </div>

          {newNeedsOptions && (
            <textarea
              value={newFilterRaw}
              onChange={(e) => setNewFilterRaw(e.target.value)}
              placeholder="筛选值（一行一个，或逗号分隔）"
              className="border-input bg-background min-h-8 w-64 rounded-lg border px-2 py-1 text-sm"
              rows={2}
            />
          )}

          <Button
            size="sm"
            onClick={addColumn}
            disabled={!canAdd}
            className="h-8"
          >
            <IconPlus className="size-4" />
            添加列
          </Button>
          {nameTaken && (
            <span className="text-destructive text-xs">列名已存在</span>
          )}
          {newNeedsOptions && parsedNewOptions.length === 0 && (
            <span className="text-destructive text-xs">
              勾选筛选后需至少填一个值
            </span>
          )}
        </div>
      </div>

      {filterableEntries.length > 0 && (
        <div className="bg-muted/20 flex flex-wrap items-center gap-3 border-b px-4 py-2">
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <IconFilter className="size-3.5" />
            筛选
          </span>
          {filterableEntries.map(({ col, idx }) => (
            <FilterControl
              key={col.id}
              col={col}
              value={filters[idx] ?? null}
              onChange={(c) => setCriterion(idx, c)}
            />
          ))}
          {hasActiveFilter && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={clearAllFilters}
            >
              清空筛选
            </Button>
          )}
        </div>
      )}

      <UniverSheetLazy
        className="h-[720px] w-full"
        workbookId="hh-admin-inbound"
        workbookName="入库单"
        sessionId="hh-admin-inbound"
        initialColumns={initialColumnsRef.current}
        onApi={handleApi}
      />
    </div>
  )
}

function isCriterionActiveLocal(c: FilterCriterion): boolean {
  switch (c.kind) {
    case "enum":
      return c.value !== ""
    case "numberRange":
      return c.min != null || c.max != null
    case "dateRange":
      return !!c.from || !!c.to
  }
}

interface FilterControlProps {
  col: Column
  value: FilterCriterion | null
  onChange: (c: FilterCriterion | null) => void
}

function FilterControl({ col, value, onChange }: FilterControlProps) {
  const kind = expectedKind(col)

  if (kind === "enum") {
    const current = value?.kind === "enum" ? value.value : ""
    return (
      <label className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">{col.name}</span>
        <select
          value={current}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === "" ? null : { kind: "enum", value: v })
          }}
          className="border-input bg-background h-7 rounded-md border px-2 text-xs"
        >
          <option value="">全部</option>
          {col.filterOptions!.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (kind === "numberRange") {
    const cur =
      value?.kind === "numberRange" ? value : { min: null, max: null }
    const parse = (s: string): number | null => {
      if (s === "") return null
      const n = Number(s)
      return Number.isFinite(n) ? n : null
    }
    const update = (next: { min: number | null; max: number | null }) => {
      if (next.min == null && next.max == null) return onChange(null)
      onChange({ kind: "numberRange", ...next })
    }
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">{col.name}</span>
        <input
          type="number"
          value={cur.min ?? ""}
          onChange={(e) =>
            update({ min: parse(e.target.value), max: cur.max })
          }
          placeholder="最小"
          className="border-input bg-background h-7 w-20 rounded-md border px-2 text-xs"
        />
        <span className="text-muted-foreground">~</span>
        <input
          type="number"
          value={cur.max ?? ""}
          onChange={(e) =>
            update({ min: cur.min, max: parse(e.target.value) })
          }
          placeholder="最大"
          className="border-input bg-background h-7 w-20 rounded-md border px-2 text-xs"
        />
      </div>
    )
  }

  // dateRange
  const cur = value?.kind === "dateRange" ? value : { from: null, to: null }
  const update = (next: { from: string | null; to: string | null }) => {
    if (!next.from && !next.to) return onChange(null)
    onChange({ kind: "dateRange", ...next })
  }
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{col.name}</span>
      <input
        type="date"
        value={cur.from ?? ""}
        onChange={(e) =>
          update({ from: e.target.value || null, to: cur.to })
        }
        className="border-input bg-background h-7 rounded-md border px-2 text-xs"
      />
      <span className="text-muted-foreground">~</span>
      <input
        type="date"
        value={cur.to ?? ""}
        onChange={(e) =>
          update({ from: cur.from, to: e.target.value || null })
        }
        className="border-input bg-background h-7 rounded-md border px-2 text-xs"
      />
    </div>
  )
}

interface ColumnChipProps {
  col: Column
  existingNames: string[]
  onChange: (patch: Partial<Column>) => void
  onRemove: () => void
}

function ColumnChip({
  col,
  existingNames,
  onChange,
  onRemove,
}: ColumnChipProps) {
  const [open, setOpen] = useState(false)
  const kind = expectedKind(col)

  return (
    <div
      className={cn(
        "bg-muted/50 flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm",
        open && "ring-ring ring-2",
      )}
    >
      <span className="font-medium">{col.name}</span>
      <span className="text-muted-foreground text-xs">
        {typeLabel(col.type)}
      </span>
      {col.filterable && (
        <span className="text-primary inline-flex items-center gap-0.5 text-xs">
          <IconFilter className="size-3" />
          {kind === "enum" ? (col.filterOptions?.length ?? 0) : "区间"}
        </span>
      )}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-label="编辑列"
          >
            <IconPencil className="size-3.5" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            className="bg-popover text-popover-foreground z-50 w-80 rounded-lg border p-3 shadow-md outline-none"
          >
            <ColumnEditForm
              col={col}
              existingNames={existingNames}
              onSubmit={(patch) => {
                onChange(patch)
                setOpen(false)
              }}
              onCancel={() => setOpen(false)}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
        aria-label="删除"
      >
        <IconX className="size-3.5" />
      </button>
    </div>
  )
}

interface ColumnEditFormProps {
  col: Column
  existingNames: string[]
  onSubmit: (patch: Partial<Column>) => void
  onCancel: () => void
}

function ColumnEditForm({
  col,
  existingNames,
  onSubmit,
  onCancel,
}: ColumnEditFormProps) {
  const [name, setName] = useState(col.name)
  const [type, setType] = useState<ColumnType>(col.type)
  const [filterable, setFilterable] = useState(col.filterable)
  const [raw, setRaw] = useState((col.filterOptions ?? []).join("\n"))

  const trimmed = name.trim()
  const parsed = useMemo(() => parseOptions(raw), [raw])

  const needsOptions = filterable && (type === "text" || type === "select")

  const nameTaken = existingNames.includes(trimmed)
  const nameEmpty = trimmed.length === 0
  const optionsMissing = needsOptions && parsed.length === 0
  const canSave = !nameEmpty && !nameTaken && !optionsMissing

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs">列名</label>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameEmpty || nameTaken || undefined}
        />
        {nameTaken && (
          <span className="text-destructive text-xs">列名已存在</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs">类型</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ColumnType)}
          className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={filterable}
          onChange={(e) => setFilterable(e.target.checked)}
          className="size-4"
        />
        可筛选
        {filterable && !needsOptions && (
          <span className="text-muted-foreground text-xs">
            （{type === "number" ? "按数值区间" : "按日期区间"}）
          </span>
        )}
      </label>

      {needsOptions && (
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">
            筛选值（一行一个，或逗号分隔）
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={4}
            className="border-input bg-background w-full rounded-lg border px-2 py-1 text-sm"
            aria-invalid={optionsMissing || undefined}
          />
          {parsed.length > 0 && (
            <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
              {parsed.map((v) => (
                <span
                  key={v}
                  className="bg-muted rounded px-1.5 py-0.5"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
          {optionsMissing && (
            <span className="text-destructive text-xs">
              至少填一个筛选值
            </span>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() =>
            onSubmit({
              name: trimmed,
              type,
              filterable,
              filterOptions: needsOptions ? parsed : undefined,
            })
          }
        >
          保存
        </Button>
      </div>
    </div>
  )
}
