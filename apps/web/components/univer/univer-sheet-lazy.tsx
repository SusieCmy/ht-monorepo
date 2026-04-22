"use client"

import dynamic from "next/dynamic"

export const UniverSheetLazy = dynamic(
  () =>
    import("./univer-sheet").then((m) => ({
      default: m.UniverSheet,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-[720px] items-center justify-center text-sm">
        正在加载 Univer 表格...
      </div>
    ),
  },
)
