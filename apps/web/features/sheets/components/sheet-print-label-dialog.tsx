"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { Rnd } from "react-rnd"
import { toPng } from "html-to-image"
import Barcode from "react-barcode"
import {
  IconBarcode,
  IconCheck,
  IconDeviceFloppy,
  IconPlus,
  IconPrinter,
  IconTextPlus,
  IconTrash,
} from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import type { DictItem } from "@/lib/query/options/dicts"
import type { SheetColumn } from "@/lib/query/options/sheet-configs"
import type { SheetRow } from "@/lib/query/options/sheet-rows"

/**
 * 动态表格版"打印标签"弹窗。
 *
 * 与旧版 `print-label-dialog` 的区别：
 *  - 数据源换成 `SheetRow.values[colId]`，配合 `SheetColumn` 拿 header 显示名；
 *  - dict 列直接拿字典 label；number/date 透传字符串；text 亦然。
 *  - 条形码默认值用 `row.id`（后端主键字符串形式）；用户可在右侧面板里改。
 *
 * 画布交互（Rnd 拖拽 / Resize、导出 PNG、单独窗口打印）完整保留。
 */

interface LabelElement {
  id: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  bold: boolean
  kind: "text" | "barcode"
  content: string
  /**
   * 来源列 id。从左侧"行字段"列表加入画布的元素会带这个标记；
   * 用户用"新增文本 / 新增条形码"凭空加出来的元素没有该字段。
   * 字段列表通过它判断某列是否已经在画布上。
   */
  sourceColId?: string
}

interface SheetPrintLabelDialogProps {
  row: SheetRow | null
  columns: readonly SheetColumn[]
  /** 字典列在展示时需要 items，用不到时传空对象即可。 */
  dictItemsByCode?: Record<string, DictItem[]>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 标题前缀，默认"打印标签"；可以传业务名称（例如"入库标签"）。 */
  title?: string
}

const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 320
const BARCODE_FIT_CSS = `.barcode-fit > svg { width: 100% !important; height: 100% !important; display: block; }`

/**
 * 把某一列的原始值翻译成人类可读的显示值：
 *  - dict 列：values 里存的是 label；若为空，显示 ""
 *  - 其它列：直接透传（已经是字符串）
 *
 * 这里故意不做单位 / 格式化，标签布局里想看什么由用户后续在文本框改。
 */
function formatColumnValue(
  col: SheetColumn,
  raw: string,
  _dictItemsByCode: Record<string, DictItem[]>,
): string {
  if (!raw) return ""
  // dict 列目前存的就是 label，不需要再查表；保留参数签名方便将来升级成
  // 存 value → 查 label 模式时能平滑替换。
  return raw
}

/**
 * 生成默认标签布局：**画布保持空白**，仅保留一个居于底部的条形码。
 *
 * 产品需求：打开弹窗时模板里不要预先塞任何业务字段；所有"列名：值"都
 * 由用户从左侧"行字段"列表按需挑选。条码仍然保留一个默认元素，方便多
 * 数场景直接打印；如果不需要也可以在右侧面板里删掉。
 *
 * 条形码放在画布底部、距下边界 24px 处（避免贴边溢出画布）。
 */
function buildInitialElements(row: SheetRow): LabelElement[] {
  const barcodeH = 60
  const barcodeY = CANVAS_HEIGHT - barcodeH - 24
  return [
    {
      id: "el-barcode",
      x: 20,
      y: barcodeY,
      w: CANVAS_WIDTH - 40,
      h: barcodeH,
      fontSize: 12,
      bold: false,
      kind: "barcode",
      content: String(row.id),
    },
  ]
}

/**
 * 计算新加入字段的 y 坐标：按已有"带 sourceColId 的文本"的底部继续往下排，
 * 避免所有新字段都落在相同坐标。首行从画布顶部 12px 开始。
 *
 * 如果已经快贴到默认条码上方，就压回条码上方 22px；超出就允许重叠，
 * 由用户自己拖走（优先保证"点了就能看见"）。
 */
function findNextFieldY(elements: LabelElement[]): number {
  const topY = 12
  const usedBottoms = elements
    .filter((e) => e.kind === "text" && Boolean(e.sourceColId))
    .map((e) => e.y + e.h)
  const fromExisting =
    usedBottoms.length > 0 ? Math.max(...usedBottoms) + 4 : topY
  // 条码默认 y = CANVAS_HEIGHT - 60 - 24 = 236；新字段最多到 214。
  const maxY = CANVAS_HEIGHT - 60 - 24 - 22
  return Math.min(fromExisting, Math.max(maxY, topY))
}

function toElementStyle(el: LabelElement): CSSProperties {
  if (el.kind === "barcode") {
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      padding: 0,
      boxSizing: "border-box",
      background: "transparent",
      overflow: "hidden",
    }
  }
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    width: "100%",
    height: "100%",
    padding: "2px 6px",
    boxSizing: "border-box",
    fontSize: `${el.fontSize}px`,
    fontWeight: el.bold ? 700 : 400,
    lineHeight: 1.2,
    color: "#111",
    background: "transparent",
    userSelect: "none",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  }
}

function renderElementContent(el: LabelElement) {
  if (el.kind === "barcode") {
    const value = el.content?.trim() ? el.content : "0000000000"
    return (
      <div className="barcode-fit" style={{ width: "100%", height: "100%" }}>
        <Barcode
          value={value}
          format="CODE128"
          renderer="svg"
          displayValue
          fontSize={Math.max(el.fontSize, 10)}
          height={Math.max(el.h - 20, 20)}
          width={1.6}
          margin={0}
          background="#ffffff"
          lineColor="#000000"
        />
      </div>
    )
  }
  return el.content
}

/**
 * 静态渲染版（不带 Rnd handle）用于导出 PNG / 新窗口打印的 outerHTML 源。
 * 离屏挂载在文档流中，`html-to-image` 才能读到 computed style。
 */
const StaticLabel = forwardRef<
  HTMLDivElement,
  { elements: LabelElement[]; width: number; height: number }
>(function StaticLabel({ elements, width, height }, ref) {
  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width,
        height,
        background: "#ffffff",
        overflow: "hidden",
      }}
    >
      <style>{BARCODE_FIT_CSS}</style>
      {elements.map((el) => (
        <div
          key={el.id}
          style={{
            position: "absolute",
            left: el.x,
            top: el.y,
            width: el.w,
            height: el.h,
          }}
        >
          <div style={toElementStyle(el)}>{renderElementContent(el)}</div>
        </div>
      ))}
    </div>
  )
})

export function SheetPrintLabelDialog({
  row,
  columns,
  dictItemsByCode,
  open,
  onOpenChange,
  title = "打印标签",
}: SheetPrintLabelDialogProps) {
  const [elements, setElements] = useState<LabelElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const staticRef = useRef<HTMLDivElement>(null)

  // 打开 / 切换 row 时重新构建默认布局；这样一次编辑只对当前行生效，
  // 关闭再打开下一行时不会带入上一行的残留。
  //
  // 这里**不**把 columns / dictItemsByCode 放进依赖：默认模板已经是空的，
  // 字典 items 异步到达或列配置刷新时没必要把用户编辑中的画布重置。
  useEffect(() => {
    if (open && row) {
      setElements(buildInitialElements(row))
      setSelectedId(null)
    }
  }, [open, row])

  const selected = useMemo(
    () => elements.find((e) => e.id === selectedId) ?? null,
    [elements, selectedId],
  )

  const patchElement = useCallback(
    (id: string, patch: Partial<LabelElement>) => {
      setElements((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      )
    },
    [],
  )

  const addText = useCallback(() => {
    const id = `el-${Date.now()}`
    setElements((prev) => [
      ...prev,
      {
        id,
        x: 20,
        y: 20,
        w: 160,
        h: 24,
        fontSize: 14,
        bold: false,
        kind: "text",
        content: "新文本",
      },
    ])
    setSelectedId(id)
  }, [])

  const addBarcode = useCallback(() => {
    const id = `el-${Date.now()}`
    setElements((prev) => [
      ...prev,
      {
        id,
        x: 40,
        y: 200,
        w: 240,
        h: 60,
        fontSize: 12,
        bold: false,
        kind: "barcode",
        content: row ? String(row.id) : "0000000000",
      },
    ])
    setSelectedId(id)
  }, [row])

  /**
   * 把某一列作为一个新文本元素加进画布，并自动定位到"最后一个字段行"下面。
   * 已经存在同一 sourceColId 时不会重复加，避免用户快速点击。
   */
  const addColumnElement = useCallback(
    (col: SheetColumn) => {
      if (!row) return
      setElements((prev) => {
        if (prev.some((e) => e.sourceColId === col.id)) return prev
        const raw = row.values?.[col.id] ?? ""
        const display = formatColumnValue(col, raw, dictItemsByCode ?? {})
        const y = findNextFieldY(prev)
        const id = `el-col-${col.id}-${Date.now()}`
        const next: LabelElement = {
          id,
          x: 16,
          y,
          w: CANVAS_WIDTH - 32,
          h: 22,
          fontSize: 13,
          bold: false,
          kind: "text",
          content: `${col.name}：${display}`,
          sourceColId: col.id,
        }
        // 选中新加入的元素，方便立刻调整。setState 里禁止直接调用
        // setSelectedId（会在 render 阶段更新），改成 queueMicrotask。
        queueMicrotask(() => setSelectedId(id))
        return [...prev, next]
      })
    },
    [row, dictItemsByCode],
  )

  /** 按列 id 把画布上对应的元素全部移除（同一列理论上只会存在一个）。 */
  const removeColumnElement = useCallback((colId: string) => {
    setElements((prev) => {
      const next = prev.filter((e) => e.sourceColId !== colId)
      // 如果当前选中的元素被清掉了，顺手把选中状态也置空。
      setSelectedId((cur) =>
        cur && next.some((e) => e.id === cur) ? cur : null,
      )
      return next
    })
  }, [])

  const addAllColumns = useCallback(() => {
    if (!row) return
    setElements((prev) => {
      const existed = new Set(
        prev.map((e) => e.sourceColId).filter((x): x is string => Boolean(x)),
      )
      let y = findNextFieldY(prev)
      const extras: LabelElement[] = []
      for (const col of columns) {
        if (existed.has(col.id)) continue
        const raw = row.values?.[col.id] ?? ""
        const display = formatColumnValue(col, raw, dictItemsByCode ?? {})
        extras.push({
          id: `el-col-${col.id}-${Date.now()}-${extras.length}`,
          x: 16,
          y,
          w: CANVAS_WIDTH - 32,
          h: 22,
          fontSize: 13,
          bold: false,
          kind: "text",
          content: `${col.name}：${display}`,
          sourceColId: col.id,
        })
        y += 26
      }
      return [...prev, ...extras]
    })
  }, [row, columns, dictItemsByCode])

  const clearAllColumns = useCallback(() => {
    setElements((prev) => prev.filter((e) => !e.sourceColId))
    setSelectedId(null)
  }, [])

  const removeSelected = useCallback(() => {
    if (!selectedId) return
    setElements((prev) => prev.filter((e) => e.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  const handleDownload = useCallback(async () => {
    if (!staticRef.current) return
    try {
      const dataUrl = await toPng(staticRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
      })
      const a = document.createElement("a")
      a.href = dataUrl
      a.download = `${row?.id ?? "label"}.png`
      a.click()
    } catch (err) {
      console.error("[sheet-print-label] export png failed", err)
    }
  }, [row])

  const handlePrint = useCallback(() => {
    if (!staticRef.current) return
    const html = staticRef.current.outerHTML
    const w = window.open("", "_blank", "width=480,height=360")
    if (!w) return
    w.document.open()
    w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${title} ${row?.id ?? ""}</title>
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { display: flex; align-items: center; justify-content: center; }
  @page { size: auto; margin: 8mm; }
</style>
</head>
<body>
${html}
<script>
  window.addEventListener('load', function () {
    setTimeout(function () {
      window.focus();
      window.print();
    }, 50);
  });
  window.addEventListener('afterprint', function () { window.close(); });
<\/script>
</body>
</html>`)
    w.document.close()
  }, [row, title])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1100px]" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            拖动元素调整位置、拉拽边缘改大小；右侧面板调整选中元素的样式。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <Button size="sm" variant="outline" onClick={addText}>
            <IconTextPlus className="size-4" />
            新增文本
          </Button>
          <Button size="sm" variant="outline" onClick={addBarcode}>
            <IconBarcode className="size-4" />
            新增条形码
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={removeSelected}
            disabled={!selectedId}
          >
            <IconTrash className="size-4" />
            删除选中
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleDownload}>
              <IconDeviceFloppy className="size-4" />
              下载为图片
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <IconPrinter className="size-4" />
              打印
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[210px_1fr_220px]">
          {/* 左侧：行字段列表 — 点击把字段文本加入画布，再点一次即移除。
              这是用户"自己选哪些字段上模板"的主入口；默认布局里只有标题
              和条码，所有正文都由这里挑选。 */}
          <aside className="flex max-h-[460px] flex-col rounded-md border">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-xs font-medium">行字段</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
                  onClick={addAllColumns}
                  disabled={!row || columns.length === 0}
                  title="把全部字段一次性加入画布"
                >
                  全部加入
                </button>
                <span className="text-muted-foreground text-[11px]">|</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive text-[11px] underline-offset-2 hover:underline"
                  onClick={clearAllColumns}
                  disabled={!row || elements.every((e) => !e.sourceColId)}
                  title="从画布移除所有行字段（保留标题 / 条码）"
                >
                  全部移除
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-2">
              {columns.length === 0 ? (
                <p className="text-muted-foreground px-2 py-4 text-center text-xs">
                  当前表还没有配置列
                </p>
              ) : null}
              {columns.map((col) => {
                const raw = row?.values?.[col.id] ?? ""
                const display =
                  formatColumnValue(col, raw, dictItemsByCode ?? {}) || "—"
                const onCanvas = elements.some(
                  (e) => e.sourceColId === col.id,
                )
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() =>
                      onCanvas
                        ? removeColumnElement(col.id)
                        : addColumnElement(col)
                    }
                    className={
                      "group flex items-start justify-between gap-2 rounded border px-2 py-1.5 text-left text-xs transition " +
                      (onCanvas
                        ? "border-primary/50 bg-primary/10 hover:bg-primary/15"
                        : "hover:bg-accent/40 border-transparent")
                    }
                    title={onCanvas ? "点击从画布移除" : "点击加入画布"}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground truncate font-medium">
                        {col.name}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {display}
                      </div>
                    </div>
                    {onCanvas ? (
                      <IconCheck className="text-primary size-4 shrink-0" />
                    ) : (
                      <IconPlus className="text-muted-foreground size-4 shrink-0 opacity-70 group-hover:opacity-100" />
                    )}
                  </button>
                )
              })}
            </div>
          </aside>
          <div
            className="bg-muted/40 flex min-h-[360px] items-center justify-center rounded-md border p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null)
            }}
          >
            <style>{BARCODE_FIT_CSS}</style>
            <div
              style={{
                position: "relative",
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                background: "#ffffff",
                border: "1px solid #94a3b8",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              {elements.map((el) => {
                const isSelected = el.id === selectedId
                return (
                  <Rnd
                    key={el.id}
                    size={{ width: el.w, height: el.h }}
                    position={{ x: el.x, y: el.y }}
                    bounds="parent"
                    onDragStart={() => setSelectedId(el.id)}
                    onDragStop={(_, d) =>
                      patchElement(el.id, { x: d.x, y: d.y })
                    }
                    onResizeStart={() => setSelectedId(el.id)}
                    onResizeStop={(_, __, ref, ___, pos) =>
                      patchElement(el.id, {
                        w: ref.offsetWidth,
                        h: ref.offsetHeight,
                        x: pos.x,
                        y: pos.y,
                      })
                    }
                    style={{
                      outline: isSelected
                        ? "1px dashed #2563eb"
                        : "1px dashed transparent",
                      outlineOffset: 2,
                      cursor: "move",
                    }}
                  >
                    <div
                      onMouseDown={() => setSelectedId(el.id)}
                      style={toElementStyle(el)}
                    >
                      {renderElementContent(el)}
                    </div>
                  </Rnd>
                )
              })}
            </div>
          </div>

          <aside className="flex flex-col gap-3 rounded-md border p-3">
            <div className="text-muted-foreground text-xs font-medium">
              {selected ? "编辑选中元素" : "点击画布中的元素进行编辑"}
            </div>
            {selected && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="label-content" className="text-xs">
                    {selected.kind === "barcode" ? "条形码值" : "内容"}
                  </Label>
                  <Input
                    id="label-content"
                    value={selected.content}
                    onChange={(e) =>
                      patchElement(selected.id, { content: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="label-font-size" className="text-xs">
                    字号
                  </Label>
                  <Input
                    id="label-font-size"
                    type="number"
                    min={8}
                    max={48}
                    value={selected.fontSize}
                    onChange={(e) =>
                      patchElement(selected.id, {
                        fontSize: Number(e.target.value) || 14,
                      })
                    }
                  />
                </div>
                {selected.kind === "text" && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selected.bold}
                      onChange={(e) =>
                        patchElement(selected.id, { bold: e.target.checked })
                      }
                    />
                    加粗
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.kind === "barcode"}
                    onChange={(e) =>
                      patchElement(selected.id, {
                        kind: e.target.checked ? "barcode" : "text",
                      })
                    }
                  />
                  渲染为条形码
                </label>
                <div className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                  位置 x:{Math.round(selected.x)} y:{Math.round(selected.y)}
                  <br />
                  尺寸 w:{Math.round(selected.w)} h:{Math.round(selected.h)}
                </div>
              </>
            )}
          </aside>
        </div>

        {/* 导出 / 打印使用的离屏静态节点。position:fixed + 偏移 99999，
            既不影响布局也不会被 html-to-image 丢失 computed style。 */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: -99999,
            top: 0,
            pointerEvents: "none",
          }}
        >
          <StaticLabel
            ref={staticRef}
            elements={elements}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
