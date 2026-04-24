"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * 极简 toast 实现：一个右下角队列，支持 success / error / info / warning。
 * 项目里没有装 sonner/@shadcn toast，为了不引入新依赖，这里用 Context
 * 手搓一个够用的版本：
 *  - 消息上限 5 条，溢出时把最老的顶掉；
 *  - 默认 3s 自动消失，error 默认 5s（让用户看清错误）；
 *  - 不支持关闭按钮之外的富交互（不做进度条 / undo 按钮），
 *    业务里确实需要再加。
 */

export type ToastTone = "success" | "error" | "warning" | "info"

export interface ToastOptions {
  title: ReactNode
  description?: ReactNode
  /** 覆盖默认显示时长（毫秒），传 0 表示不自动关闭。 */
  durationMs?: number
}

interface ToastItem extends ToastOptions {
  id: number
  tone: ToastTone
}

interface ToastContextValue {
  toast: {
    success: (options: ToastOptions) => void
    error: (options: ToastOptions) => void
    warning: (options: ToastOptions) => void
    info: (options: ToastOptions) => void
  }
}

const MAX_STACK = 5
const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 3000,
  info: 3000,
  warning: 4000,
  error: 5000,
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error(
      "useToast 必须在 <ToastProvider> 内使用；请确认 app/layout.tsx 有挂上。",
    )
  }
  return ctx.toast
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  const push = useCallback((tone: ToastTone, options: ToastOptions) => {
    idRef.current += 1
    const id = idRef.current
    const item: ToastItem = { id, tone, ...options }
    setItems((prev) => {
      const next = [...prev, item]
      return next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next
    })
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: {
        success: (o) => push("success", o),
        error: (o) => push("error", o),
        warning: (o) => push("warning", o),
        info: (o) => push("info", o),
      },
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="通知"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[320px] flex-col gap-2"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onClose={() => remove(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem
  onClose: () => void
}) {
  const duration =
    item.durationMs ?? DEFAULT_DURATIONS[item.tone] ?? 3000

  useEffect(() => {
    if (duration <= 0) return
    const t = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(t)
  }, [duration, onClose])

  const Icon = toneIcon(item.tone)

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-md border bg-background p-3 shadow-lg",
        "animate-in slide-in-from-right-4 fade-in-0 duration-200",
        toneBorderClass(item.tone),
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          toneBadgeClass(item.tone),
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate text-sm font-medium">
          {item.title}
        </div>
        {item.description ? (
          <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            {item.description}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭通知"
        className="text-muted-foreground hover:text-foreground -mr-1 -mt-0.5 rounded p-1 transition"
      >
        <IconX className="size-3.5" />
      </button>
    </div>
  )
}

function toneIcon(tone: ToastTone) {
  switch (tone) {
    case "success":
      return IconCircleCheck
    case "error":
    case "warning":
      return IconAlertTriangle
    default:
      return IconInfoCircle
  }
}

function toneBadgeClass(tone: ToastTone): string {
  switch (tone) {
    case "success":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    case "error":
      return "bg-destructive/10 text-destructive"
    case "warning":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
    default:
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
  }
}

function toneBorderClass(tone: ToastTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 dark:border-emerald-900"
    case "error":
      return "border-destructive/40"
    case "warning":
      return "border-amber-200 dark:border-amber-900"
    default:
      return "border-sky-200 dark:border-sky-900"
  }
}
