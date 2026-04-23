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

// 标签画布上的单个元素。
// bordered=true 时画一个描边框、文字居中，用来表达“条形码占位”；
// 其它情况就是纯文字块。把两种元素合并成同一种结构，省一套类型分支。
interface LabelElement {
  id: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
  bold: boolean
  bordered: boolean
  content: string
}

interface PrintLabelDialogProps {
  row: InboundRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// 标签画布默认尺寸，单位 px。布局用绝对定位 + 这个宽高组合出坐标系，
// 打印 / 导出都会复用同一套坐标，所以这里定死比较省心。
const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 300

// 根据行数据生成默认元素布局。字段顺序和图片里的示意风格对齐：
// 顶部一个大单号、下面一列 key-value、最底是条形码占位。
function buildInitialElements(row: InboundRow): LabelElement[] {
  const lines: Array<{ content: string; bold?: boolean; fontSize?: number }> = [
    { content: row.id, bold: true, fontSize: 20 },
    { content: `商品：${row.product}` },
    { content: `SKU：${row.sku}` },
    { content: `批次：${row.batch}` },
    { content: `数量：${row.qty} 件` },
    { content: `供应商：${row.supplier}` },
    { content: `日期：${row.date}` },
  ]

  const elements: LabelElement[] = lines.map((line, i) => ({
    id: `el-${i}`,
    x: 16,
    y: i === 0 ? 10 : 42 + (i - 1) * 26,
    w: CANVAS_WIDTH - 32,
    h: i === 0 ? 28 : 22,
    fontSize: line.fontSize ?? 14,
    bold: line.bold ?? false,
    bordered: false,
    content: line.content,
  }))

  elements.push({
    id: "el-barcode",
    x: 16,
    y: 230,
    w: CANVAS_WIDTH - 32,
    h: 50,
    fontSize: 14,
    bold: false,
    bordered: true,
    content: "条形码",
  })

  return elements
}

// 每个元素在画布里的 inline-style。编辑态 / 静态渲染共用这套样式，
// 导出图片 & 新窗口打印才能和编辑预览 1:1 一致。
function toElementStyle(el: LabelElement): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: el.bordered ? "center" : "flex-start",
    width: "100%",
    height: "100%",
    padding: "2px 6px",
    boxSizing: "border-box",
    fontSize: `${el.fontSize}px`,
    fontWeight: el.bold ? 700 : 400,
    lineHeight: 1.2,
    color: "#111",
    border: el.bordered ? "1px solid #9ca3af" : "none",
    borderRadius: el.bordered ? 4 : 0,
    background: "transparent",
    userSelect: "none",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  }
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
          <div style={toElementStyle(el)}>{el.content}</div>
        </div>
      ))}
    </div>
  )
})

export function PrintLabelDialog({
  row,
  open,
  onOpenChange,
}: PrintLabelDialogProps) {
  const [elements, setElements] = useState<LabelElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const staticRef = useRef<HTMLDivElement>(null)

  // dialog 每次重新打开或切换 row，都把画布重置成默认布局。
  // 不做持久化，符合“临时编辑”的定位；需要保存模板的话往这里接 store 即可。
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
        bordered: false,
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
        h: 50,
        fontSize: 14,
        bold: false,
        bordered: true,
        content: "条形码",
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
            新增条形码框
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
            className="bg-muted/40 flex min-h-[340px] items-center justify-center rounded-md border p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null)
            }}
          >
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
                      {el.content}
                    </div>
                  </Rnd>
                )
              })}
            </div>
          </div>

          {/* 右侧属性面板：只对选中元素生效，内容 / 字号 / 粗体 / 描边框 */}
          <aside className="flex flex-col gap-3 rounded-md border p-3">
            <div className="text-muted-foreground text-xs font-medium">
              {selected ? "编辑选中元素" : "点击画布中的元素进行编辑"}
            </div>
            {selected && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="label-content" className="text-xs">
                    内容
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
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.bordered}
                    onChange={(e) =>
                      patchElement(selected.id, { bordered: e.target.checked })
                    }
                  />
                  带描边框（条形码样式）
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
