"use client"

import { useMemo } from "react"

import { IconChevronDown, IconFilter, IconRotate } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import type { DictItem } from "@/lib/query/options/dicts"
import type { SheetColumn } from "@/lib/query/options/sheet-configs"

/**
 * 单列的查询条件。按列类型不同使用不同字段组合：
 *  - text:   contains
 *  - number: min / max
 *  - date:   from / to
 *  - dict:   value（严格相等）
 *
 * 表单输入全部用字符串存储（输入框原生值），真正过滤时再转换。
 * `undefined` / 空串表示该字段未设置。
 */
export interface ColumnFilter {
  contains?: string
  min?: string
  max?: string
  from?: string
  to?: string
  value?: string
}

export type FiltersState = Record<string, ColumnFilter>

/** 把"实际生效"的字段数一下，方便在按钮上显示 badge。 */
export function countActiveFilters(
  filters: FiltersState,
  columns: SheetColumn[],
): number {
  let count = 0
  for (const col of columns) {
    const f = filters[col.id]
    if (!f) continue
    if (col.type === "text") {
      if (f.contains?.trim()) count++
    } else if (col.type === "number") {
      if (f.min?.trim() || f.max?.trim()) count++
    } else if (col.type === "date") {
      if (f.from || f.to) count++
    } else if (col.type === "dict") {
      if (f.value?.trim()) count++
    }
  }
  return count
}

interface SheetFilterPanelProps {
  columns: SheetColumn[]
  /** 各字典类型下的 items，用于 dict 列的下拉选项。 */
  dictItemsByCode: Record<string, DictItem[]>
  /** 当前编辑中的筛选值（受控）。 */
  draft: FiltersState
  onDraftChange: (next: FiltersState) => void
  /** 已应用的筛选值，仅用于显示 badge 数字。 */
  applied: FiltersState
  onSubmit: () => void
  onReset: () => void
  /** 展开 / 收起。 */
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SheetFilterPanel({
  columns,
  dictItemsByCode,
  draft,
  onDraftChange,
  applied,
  onSubmit,
  onReset,
  open,
  onOpenChange,
}: SheetFilterPanelProps) {
  const activeCount = useMemo(
    () => countActiveFilters(applied, columns),
    [applied, columns],
  )

  const patch = (colId: string, partial: Partial<ColumnFilter>) => {
    const nextEntry: ColumnFilter = { ...(draft[colId] ?? {}), ...partial }
    onDraftChange({ ...draft, [colId]: nextEntry })
  }

  return (
    <div className="border-b">
      <button
        type="button"
        className="hover:bg-accent/40 flex w-full items-center justify-between px-4 py-2 text-left text-sm transition"
        onClick={() => onOpenChange(!open)}
      >
        <span className="flex items-center gap-2">
          <IconFilter className="size-4" />
          <span className="font-medium">查询</span>
          {activeCount > 0 ? (
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
              已筛选 {activeCount} 项
            </span>
          ) : null}
          {columns.length === 0 ? (
            <span className="text-muted-foreground text-xs">
              还没有列，先配置表头
            </span>
          ) : null}
        </span>
        <IconChevronDown
          className={`text-muted-foreground size-4 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && columns.length > 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="space-y-3 px-4 pb-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {columns.map((col) => (
              <div key={col.id} className="flex flex-col">
                <Label className="text-foreground truncate text-xs">
                  {col.name}
                  <span className="text-muted-foreground ml-1 font-mono">
                    {columnTypeLabel(col.type)}
                  </span>
                </Label>
                <div className="mt-1.5">
                  {col.type === "text" ? (
                    <Input
                      value={draft[col.id]?.contains ?? ""}
                      onChange={(e) =>
                        patch(col.id, { contains: e.target.value })
                      }
                      placeholder="包含..."
                      autoComplete="off"
                    />
                  ) : col.type === "number" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={draft[col.id]?.min ?? ""}
                        onChange={(e) => patch(col.id, { min: e.target.value })}
                        placeholder="最小"
                        className="w-full"
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input
                        type="number"
                        value={draft[col.id]?.max ?? ""}
                        onChange={(e) => patch(col.id, { max: e.target.value })}
                        placeholder="最大"
                        className="w-full"
                      />
                    </div>
                  ) : col.type === "date" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={draft[col.id]?.from ?? ""}
                        onChange={(e) =>
                          patch(col.id, { from: e.target.value })
                        }
                        className="w-full"
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input
                        type="date"
                        value={draft[col.id]?.to ?? ""}
                        onChange={(e) => patch(col.id, { to: e.target.value })}
                        className="w-full"
                      />
                    </div>
                  ) : col.type === "dict" ? (
                    (() => {
                      const items = col.dictTypeCode
                        ? (dictItemsByCode[col.dictTypeCode] ?? [])
                        : []
                      const current = draft[col.id]?.value ?? ""
                      // Radix Select 不支持 value=""，所以内部用 "__all__"
                      // 表示"全部"。提交时再把它还原成 undefined。
                      return (
                        <Select
                          value={current || "__all__"}
                          onValueChange={(v) =>
                            patch(col.id, {
                              value: v === "__all__" ? "" : v,
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="全部" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">全部</SelectItem>
                            {items.map((it) => (
                              <SelectItem key={it.value} value={it.label}>
                                {it.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    })()
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReset}
            >
              <IconRotate className="size-4" />
              重置
            </Button>
            <Button type="submit" size="sm">
              <IconFilter className="size-4" />
              查询
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function columnTypeLabel(t: SheetColumn["type"]): string {
  switch (t) {
    case "text":
      return "文本"
    case "number":
      return "数值"
    case "date":
      return "日期"
    case "dict":
      return "字典"
    default:
      return t
  }
}

// 说明：早先这里还导出过 `applySheetFilters` 做前端过滤。后来按需求改为
// 服务端过滤（MariaDB JSON 函数），所以该函数被移除。表单得到的
// FiltersState 会被上层透传给 `sheetRowListOptions`，由后端按 SQL 执行。
