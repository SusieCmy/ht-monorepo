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
  IconDeviceFloppy,
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

import type { InboundRow } from "./types"

// 标签画布上的单个元素。kind 决定渲染方式：
//   text    — 纯文本块
//   barcode — 通过 react-barcode 生成真实 CODE128 SVG
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
}

interface DynamicColumn {
  id: string
  headerName: string
}

interface PrintLabelDialogProps {
  row: InboundRow | null
  /** 动态扩展列定义；用来把 row.ext 里的值按表头渲染到标签上 */
  dynamicColumns?: readonly DynamicColumn[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

// 标签画布默认尺寸，单位 px。布局用绝对定位 + 这个宽高组合出坐标系，
// 打印 / 导出都会复用同一套坐标，所以这里定死比较省心。
const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 320

// 用一段内联样式让 react-barcode 生成的 SVG 按容器等比缩放填满。
// 这段样式既要在编辑画布里生效，也要能被导出/打印用的离屏节点带走。
const BARCODE_FIT_CSS = `.barcode-fit > svg { width: 100% !important; height: 100% !important; display: block; }`

// 根据行数据 + 动态扩展列生成默认元素布局：顶部大单号 → 一列 key:value → 底部条形码。
function buildInitialElements(
  row: InboundRow,
  dynamicColumns: readonly DynamicColumn[] = [],
): LabelElement[] {
  const baseLines: Array<{
    content: string
    bold?: boolean
    fontSize?: number
  }> = [
    { content: row.id, bold: true, fontSize: 20 },
    { content: `商品：${row.product}` },
    { content: `SKU：${row.sku}` },
    { content: `批次：${row.batch}` },
    { content: `数量：${row.qty} 件` },
    { content: `供应商：${row.supplier}` },
    { content: `日期：${row.date}` },
  ]

  for (const col of dynamicColumns) {
    const v = row.ext?.[col.id] ?? ""
    baseLines.push({ content: `${col.headerName}：${v}` })
  }

  const titleY = 10
  const titleH = 28
  const lineGap = 4
  const lineH = 22
  let y = titleY + titleH + lineGap

  const elements: LabelElement[] = baseLines.map((line, i) => {
    if (i === 0) {
      return {
        id: `el-${i}`,
        x: 16,
        y: titleY,
        w: CANVAS_WIDTH - 32,
        h: titleH,
        fontSize: line.fontSize ?? 14,
        bold: line.bold ?? false,
        kind: "text",
        content: line.content,
      }
    }
    const el: LabelElement = {
      id: `el-${i}`,
      x: 16,
      y,
      w: CANVAS_WIDTH - 32,
      h: lineH,
      fontSize: line.fontSize ?? 14,
      bold: line.bold ?? false,
      kind: "text",
      content: line.content,
    }
    y += lineH + lineGap
    return el
  })

  const barcodeH = 64
  const barcodeY = Math.min(y + 4, CANVAS_HEIGHT - barcodeH - 6)
  elements.push({
    id: "el-barcode",
    x: 16,
    y: barcodeY,
    w: CANVAS_WIDTH - 32,
    h: barcodeH,
    fontSize: 12,
    bold: false,
    kind: "barcode",
    content: row.id,
  })

  return elements
}

// 元素容器样式。barcode 不需要内边距 / 文本对齐，让 SVG 自己占满。
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

// 单个元素内容的渲染。barcode 走 react-barcode 的 svg renderer，
// 父级 .barcode-fit 的 CSS 会把 SVG 强制缩放到容器大小。
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

// 静态标签渲染：不依赖 react-rnd，只用 absolute 定位。
// 两个用途：
//   1. 作为导出 PNG 的源节点（避开 react-rnd 的 resize handle 被一起截进去）；
//   2. outerHTML 直接塞进新窗口打印。
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
      {/* 把 .barcode-fit 的样式塞进 outerHTML，保证新窗口打印时也能缩放 */}
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

export function PrintLabelDialog({
  row,
  dynamicColumns,
  open,
  onOpenChange,
}: PrintLabelDialogProps) {
  const [elements, setElements] = useState<LabelElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const staticRef = useRef<HTMLDivElement>(null)

  // dialog 每次重新打开或切换 row / 列定义，都把画布重置成默认布局。
  // 不做持久化，符合“临时编辑”的定位；需要保存模板的话往这里接 store 即可。
  useEffect(() => {
    if (open && row) {
      setElements(buildInitialElements(row, dynamicColumns ?? []))
      setSelectedId(null)
    }
  }, [open, row, dynamicColumns])

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

  function addText() {
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
  }

  function addBarcode() {
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
        content: row?.id ?? "0000000000",
      },
    ])
    setSelectedId(id)
  }

  function removeSelected() {
    if (!selectedId) return
    setElements((prev) => prev.filter((e) => e.id !== selectedId))
    setSelectedId(null)
  }

  // 下载 PNG 用 html-to-image 对 StaticLabel 节点渲染一次。
  // 用静态节点而不是编辑画布，是为了避开 react-rnd 加的 handle DOM。
  async function handleDownload() {
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
      console.error("[print-label] export png failed", err)
    }
  }

  // 打印：开一个干净的新窗口，写入 StaticLabel 的 outerHTML（全是 inline style，
  // 不依赖父文档 CSS），等 load 完成调 window.print()，用户取消打印也会走 afterprint。
  function handlePrint() {
    if (!staticRef.current) return
    const html = staticRef.current.outerHTML
    const w = window.open("", "_blank", "width=480,height=360")
    if (!w) return
    w.document.open()
    w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>打印标签 ${row?.id ?? ""}</title>
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
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px]" showCloseButton>
        <DialogHeader>
          <DialogTitle>打印标签</DialogTitle>
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

        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          {/* 编辑画布：灰底 + 白画布，白画布外就是 canvas 边界之外 */}
          <div
            className="bg-muted/40 flex min-h-[360px] items-center justify-center rounded-md border p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null)
            }}
          >
            {/* 编辑态也要这份样式，barcode 才能按拉拽的 w/h 缩放 */}
            <style>{BARCODE_FIT_CSS}</style>
            <div
              style={{
                position: "relative",
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                background: "#ffffff",
                border: "1px solid #d4d4d8",
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

          {/* 右侧属性面板：只对选中元素生效，内容 / 字号 / 粗体（仅文本）/ 类型互转 */}
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

        {/* 导出 / 打印用的离屏静态节点：放在视口外，但必须保留在文档流中，
            否则 html-to-image 拿不到 computed style。 */}
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
