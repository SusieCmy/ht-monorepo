"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import {
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
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

import { options } from "@/lib/query"
import type { DictItem, DictType } from "@/lib/query/options/dicts"

import {
  useCreateDictType,
  useDeleteDictType,
  useUpdateDictType,
} from "../hooks/use-dict-type-mutations"
import {
  useCreateDictItem,
  useDeleteDictItem,
  useUpdateDictItem,
} from "../hooks/use-dict-item-mutations"

/**
 * 字典管理页面：
 *  - 左侧列字典类型（可筛选 / 新增 / 编辑 / 删除）
 *  - 右侧列选中类型下的字典项（可新增 / 编辑 / 删除）
 *  - 所有操作都走后端 `/dict-type` 和 `/dict-item`
 *
 * 这里不做乐观更新的 UI 提示（如 isPending 状态条），直接依靠 hook
 * 里的 invalidate + 乐观合并让列表即时刷新。
 */
export function DictManager() {
  const typesQuery = useQuery(options.dicts.dictTypeListOptions())
  const types = useMemo(() => typesQuery.data ?? [], [typesQuery.data])

  const [selectedCode, setSelectedCode] = useState<string>("")
  const [typeFilter, setTypeFilter] = useState("")

  // types 到位之后自动选中第一个；用户主动切换过以后不再自动覆盖。
  useEffect(() => {
    if (!selectedCode && types.length > 0) {
      setSelectedCode(types[0]?.code ?? "")
    }
  }, [selectedCode, types])

  const itemsQuery = useQuery({
    ...options.dicts.dictItemListOptions({ typeCode: selectedCode }),
    // selectedCode 为空时不拉
    enabled: Boolean(selectedCode),
  })
  const items = itemsQuery.data ?? []

  const selectedType = types.find((t) => t.code === selectedCode)

  const filteredTypes = useMemo(() => {
    const q = typeFilter.trim().toLowerCase()
    if (!q) return types
    return types.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    )
  }, [types, typeFilter])

  const [typeDialogState, setTypeDialogState] = useState<
    { mode: "create" } | { mode: "edit"; target: DictType } | null
  >(null)
  const [itemDialogState, setItemDialogState] = useState<
    { mode: "create" } | { mode: "edit"; target: DictItem } | null
  >(null)

  const createType = useCreateDictType()
  const updateType = useUpdateDictType()
  const deleteType = useDeleteDictType()
  const createItem = useCreateDictItem(selectedCode)
  const updateItem = useUpdateDictItem(selectedCode)
  const deleteItem = useDeleteDictItem(selectedCode)

  const handleDeleteType = (t: DictType) => {
    if (
      !window.confirm(
        `确定删除字典类型「${t.name}（${t.code}）」？此操作会同时删除该类型下的所有字典项，且不可恢复。`,
      )
    ) {
      return
    }
    deleteType.mutate(
      { id: t.id, code: t.code },
      {
        onSuccess: () => {
          if (selectedCode === t.code) setSelectedCode("")
        },
      },
    )
  }

  const handleDeleteItem = (it: DictItem) => {
    if (
      !window.confirm(
        `确定删除字典项「${it.label}（${it.value}）」？此操作不可恢复。`,
      )
    ) {
      return
    }
    deleteItem.mutate({ id: it.id })
  }

  const typeCount = types.length
  const itemCount = items.length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">字典管理</h1>
        <p className="text-muted-foreground text-sm">
          维护系统枚举值（商品类型、仓库、状态等），供动态表格的字典列、下拉选项统一引用。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "字典类型", value: typeCount, hint: "个" },
          {
            title: "当前类型项数",
            value: selectedType ? itemCount : 0,
            hint: selectedType ? selectedType.name : "未选择",
          },
          {
            title: "加载状态",
            value: typesQuery.isPending || itemsQuery.isPending ? "加载中" : "就绪",
            hint:
              typesQuery.isError || itemsQuery.isError ? "请求失败" : "同步自服务端",
          },
        ].map((card) => (
          <div
            key={card.title}
            className="bg-card rounded-lg border p-4 shadow-sm"
          >
            <div className="text-muted-foreground text-sm">{card.title}</div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
            <div className="text-muted-foreground mt-1 text-xs">{card.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="bg-card flex flex-col rounded-lg border shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-medium">字典类型</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setTypeDialogState({ mode: "create" })}
            >
              <IconPlus className="size-4" />
              新增
            </Button>
          </div>
          <div className="relative border-b px-4 py-2">
            <IconSearch className="text-muted-foreground pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="搜索 code / name"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            />
          </div>
          {typesQuery.isError ? (
            <div className="text-destructive px-4 py-3 text-xs">
              字典类型加载失败：{typesQuery.error.message}
            </div>
          ) : null}
          <ul className="max-h-[560px] divide-y overflow-auto">
            {filteredTypes.length === 0 ? (
              <li className="text-muted-foreground px-4 py-6 text-center text-xs">
                {typesQuery.isPending
                  ? "加载中…"
                  : typeFilter
                    ? "没有匹配的字典类型"
                    : "暂无字典类型，点上方「新增」开始维护"}
              </li>
            ) : null}
            {filteredTypes.map((type) => {
              const active = selectedCode === type.code
              return (
                <li
                  key={type.code}
                  className={`group flex items-center justify-between px-4 py-3 text-sm ${
                    active ? "bg-accent/60" : "hover:bg-accent/30"
                  } cursor-pointer`}
                  onClick={() => setSelectedCode(type.code)}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{type.name}</div>
                    <div className="text-muted-foreground mt-0.5 font-mono text-xs">
                      {type.code}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      title="编辑"
                      className="text-muted-foreground hover:text-foreground rounded p-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        setTypeDialogState({ mode: "edit", target: type })
                      }}
                    >
                      <IconEdit className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="删除"
                      className="text-muted-foreground hover:text-destructive rounded p-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteType(type)
                      }}
                    >
                      <IconTrash className="size-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="bg-card flex flex-col rounded-lg border shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {selectedType ? selectedType.name : "字典项"}
                </span>
                {selectedType ? (
                  <span className="text-muted-foreground font-mono text-xs">
                    {selectedType.code}
                  </span>
                ) : null}
              </div>
              {selectedType?.description ? (
                <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                  {selectedType.description}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedType}
              onClick={() => setItemDialogState({ mode: "create" })}
            >
              <IconPlus className="size-4" />
              新增字典项
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">排序</th>
                  <th className="px-4 py-2 font-medium">标签</th>
                  <th className="px-4 py-2 font-medium">值</th>
                  <th className="px-4 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!selectedType ? (
                  <tr>
                    <td
                      className="text-muted-foreground px-4 py-6 text-center text-xs"
                      colSpan={4}
                    >
                      请先在左侧选择一个字典类型
                    </td>
                  </tr>
                ) : itemsQuery.isPending ? (
                  <tr>
                    <td
                      className="text-muted-foreground px-4 py-6 text-center text-xs"
                      colSpan={4}
                    >
                      加载中…
                    </td>
                  </tr>
                ) : itemsQuery.isError ? (
                  <tr>
                    <td
                      className="text-destructive px-4 py-6 text-center text-xs"
                      colSpan={4}
                    >
                      字典项加载失败：{itemsQuery.error.message}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      className="text-muted-foreground px-4 py-6 text-center text-xs"
                      colSpan={4}
                    >
                      暂无字典项，点右上「新增字典项」开始维护
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {item.sortOrder ?? 0}
                      </td>
                      <td className="px-4 py-2">{item.label}</td>
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {item.value}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground mr-3 text-xs transition-colors"
                          onClick={() =>
                            setItemDialogState({ mode: "edit", target: item })
                          }
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive text-xs transition-colors"
                          onClick={() => handleDeleteItem(item)}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {typeDialogState ? (
        <DictTypeFormDialog
          state={typeDialogState}
          onClose={() => setTypeDialogState(null)}
          onSubmit={async (values) => {
            if (typeDialogState.mode === "create") {
              await createType.mutateAsync(values)
            } else {
              const target = typeDialogState.target
              await updateType.mutateAsync({
                id: target.id,
                previousCode: target.code,
                ...values,
              })
              // 如果 code 改了，同步把选中 code 切到新值，避免右侧列表悬空。
              if (values.code && values.code !== target.code) {
                setSelectedCode(values.code)
              }
            }
          }}
          pending={createType.isPending || updateType.isPending}
        />
      ) : null}

      {itemDialogState && selectedType ? (
        <DictItemFormDialog
          state={itemDialogState}
          typeLabel={`${selectedType.name}（${selectedType.code}）`}
          onClose={() => setItemDialogState(null)}
          onSubmit={async (values) => {
            if (itemDialogState.mode === "create") {
              await createItem.mutateAsync(values)
            } else {
              await updateItem.mutateAsync({
                id: itemDialogState.target.id,
                ...values,
              })
            }
          }}
          pending={createItem.isPending || updateItem.isPending}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dict Type Form Dialog
// ---------------------------------------------------------------------------

interface DictTypeFormValues {
  code: string
  name: string
  description?: string
}

function DictTypeFormDialog({
  state,
  onClose,
  onSubmit,
  pending,
}: {
  state: { mode: "create" } | { mode: "edit"; target: DictType }
  onClose: () => void
  onSubmit: (values: DictTypeFormValues) => Promise<void>
  pending: boolean
}) {
  const codeId = useId()
  const nameId = useId()
  const descId = useId()

  const [code, setCode] = useState(
    state.mode === "edit" ? state.target.code : "",
  )
  const [name, setName] = useState(
    state.mode === "edit" ? state.target.name : "",
  )
  const [description, setDescription] = useState(
    state.mode === "edit" ? (state.target.description ?? "") : "",
  )
  const [codeError, setCodeError] = useState("")
  const [nameError, setNameError] = useState("")
  const [submitError, setSubmitError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    let hasError = false
    const codeTrim = code.trim()
    const nameTrim = name.trim()
    if (!codeTrim) {
      setCodeError("请填写 code")
      hasError = true
    } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(codeTrim)) {
      setCodeError("code 只能包含字母、数字、下划线，且以字母开头")
      hasError = true
    }
    if (!nameTrim) {
      setNameError("请填写名称")
      hasError = true
    }
    if (hasError) return

    try {
      await onSubmit({
        code: codeTrim,
        name: nameTrim,
        description: description.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "保存失败")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {state.mode === "create" ? "新增字典类型" : "编辑字典类型"}
            </DialogTitle>
            <DialogDescription>
              code 在后续引用中充当稳定键；name 是面向业务用户的展示名。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor={codeId} className="text-foreground">
                code
              </Label>
              <Input
                id={codeId}
                className="mt-1.5 font-mono"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  if (codeError) setCodeError("")
                }}
                placeholder="例如：product_type"
                autoFocus={state.mode === "create"}
                autoComplete="off"
                aria-invalid={Boolean(codeError)}
              />
              {codeError ? (
                <p className="text-destructive mt-1.5 text-xs" role="alert">
                  {codeError}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor={nameId} className="text-foreground">
                名称
              </Label>
              <Input
                id={nameId}
                className="mt-1.5"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError("")
                }}
                placeholder="例如：商品类型"
                autoComplete="off"
                aria-invalid={Boolean(nameError)}
              />
              {nameError ? (
                <p className="text-destructive mt-1.5 text-xs" role="alert">
                  {nameError}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor={descId} className="text-foreground">
                描述（可选）
              </Label>
              <textarea
                id={descId}
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1.5 flex min-h-[72px] w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简短说明这个字典的用途"
              />
            </div>
            {submitError ? (
              <p className="text-destructive text-xs" role="alert">
                {submitError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dict Item Form Dialog
// ---------------------------------------------------------------------------

interface DictItemFormValues {
  value: string
  label: string
  sortOrder?: number
}

function DictItemFormDialog({
  state,
  typeLabel,
  onClose,
  onSubmit,
  pending,
}: {
  state: { mode: "create" } | { mode: "edit"; target: DictItem }
  typeLabel: string
  onClose: () => void
  onSubmit: (values: DictItemFormValues) => Promise<void>
  pending: boolean
}) {
  const valueId = useId()
  const labelId = useId()
  const sortId = useId()

  const [value, setValue] = useState(
    state.mode === "edit" ? state.target.value : "",
  )
  const [label, setLabel] = useState(
    state.mode === "edit" ? state.target.label : "",
  )
  const [sortOrder, setSortOrder] = useState<string>(
    state.mode === "edit" ? String(state.target.sortOrder ?? 0) : "0",
  )
  const [valueError, setValueError] = useState("")
  const [labelError, setLabelError] = useState("")
  const [submitError, setSubmitError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    let hasError = false
    const valueTrim = value.trim()
    const labelTrim = label.trim()
    if (!valueTrim) {
      setValueError("请填写 value")
      hasError = true
    }
    if (!labelTrim) {
      setLabelError("请填写 label")
      hasError = true
    }
    if (hasError) return

    try {
      await onSubmit({
        value: valueTrim,
        label: labelTrim,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      })
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "保存失败")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {state.mode === "create" ? "新增字典项" : "编辑字典项"}
            </DialogTitle>
            <DialogDescription>
              所属字典类型：<span className="font-mono">{typeLabel}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor={valueId} className="text-foreground">
                value（存储值）
              </Label>
              <Input
                id={valueId}
                className="mt-1.5 font-mono"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  if (valueError) setValueError("")
                }}
                placeholder="例如：electronics"
                autoFocus={state.mode === "create"}
                autoComplete="off"
                aria-invalid={Boolean(valueError)}
              />
              {valueError ? (
                <p className="text-destructive mt-1.5 text-xs" role="alert">
                  {valueError}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor={labelId} className="text-foreground">
                label（展示名）
              </Label>
              <Input
                id={labelId}
                className="mt-1.5"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value)
                  if (labelError) setLabelError("")
                }}
                placeholder="例如：电子产品"
                autoComplete="off"
                aria-invalid={Boolean(labelError)}
              />
              {labelError ? (
                <p className="text-destructive mt-1.5 text-xs" role="alert">
                  {labelError}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor={sortId} className="text-foreground">
                排序
              </Label>
              <Input
                id={sortId}
                className="mt-1.5 w-32"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="越小越靠前，默认 0"
              />
            </div>
            {submitError ? (
              <p className="text-destructive text-xs" role="alert">
                {submitError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
