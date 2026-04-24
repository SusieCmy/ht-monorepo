"use client"

import dynamic from "next/dynamic"

import type { SheetGridProps } from "./sheet-grid"

// AG Grid 依赖 DOM，走 ssr:false 懒加载；Next.js 16 要求 ssr:false 必须在
// Client Component 里用，所以这层 wrapper 不能省。
const SheetGrid = dynamic(
  () => import("./sheet-grid").then((m) => ({ default: m.SheetGrid })),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-[600px] items-center justify-center rounded-lg border text-sm shadow-sm">
        正在加载表格...
      </div>
    ),
  },
)

export type SheetGridClientProps = SheetGridProps

export function SheetGridClient(props: SheetGridClientProps) {
  return <SheetGrid {...props} />
}
