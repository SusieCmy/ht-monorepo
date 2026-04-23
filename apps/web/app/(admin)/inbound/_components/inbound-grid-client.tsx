"use client"

import dynamic from "next/dynamic"

import type { InboundGridVariant } from "./inbound-grid"

// AG Grid 依赖 DOM，挂到 Client Component 里用 ssr:false 懒加载；
// Next.js 16 不允许在 Server Component 里使用 ssr:false，这层 wrapper 必不可少。
const InboundGrid = dynamic(
  () =>
    import("./inbound-grid").then((m) => ({ default: m.InboundGrid })),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-[600px] items-center justify-center rounded-lg border text-sm shadow-sm">
        正在加载表格...
      </div>
    ),
  },
)

export interface InboundGridClientProps {
  variant?: InboundGridVariant
}

export function InboundGridClient({ variant }: InboundGridClientProps = {}) {
  return <InboundGrid variant={variant} />
}
