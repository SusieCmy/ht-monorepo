"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  IconAlertTriangle,
  IconInfoCircle,
  IconQuestionMark,
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

/**
 * 全局确认弹窗：用来彻底替掉 `window.confirm`。
 *
 * 为什么要自己做：
 *  - 原生 `window.confirm` 在现代浏览器里长相丑、样式无法定制，
 *    也无法支持"破坏性操作"（红色确认）、富文本说明之类的 UX；
 *  - 很多按钮点击后还要发 mutation，调用方希望 `await confirm(...)`
 *    拿到 true/false 同步往下走，而不是把逻辑拆进两个回调。
 *
 * 使用：
 *   const confirm = useConfirm()
 *   const ok = await confirm({
 *     title: "确认出库？",
 *     description: "操作会先复制到出库表，再从入库表移除。",
 *     confirmText: "出库",
 *     tone: "destructive",
 *   })
 *   if (!ok) return
 *   // 继续 mutation ...
 */

export type ConfirmTone = "default" | "destructive" | "warning" | "info"

export interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  tone?: ConfirmTone
}

type Resolver = (value: boolean) => void

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

/** Hook：返回一个 `confirm(options) => Promise<boolean>`。 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error(
      "useConfirm 必须在 <ConfirmProvider> 内使用；请确认 app/layout.tsx 有挂上。",
    )
  }
  return ctx.confirm
}

interface ConfirmState extends ConfirmOptions {
  id: number
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  // 多次连续调用时，只保留最后一次的 resolver（前一次直接当用户点了取消）。
  const resolverRef = useRef<Resolver | null>(null)
  const idRef = useRef(0)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      if (resolverRef.current) resolverRef.current(false)
      resolverRef.current = resolve
      idRef.current += 1
      setState({ id: idRef.current, ...options })
    })
  }, [])

  const resolveAndClose = useCallback((value: boolean) => {
    const r = resolverRef.current
    resolverRef.current = null
    setState(null)
    if (r) r(value)
  }, [])

  const value = useMemo<ConfirmContextValue>(
    () => ({ confirm }),
    [confirm],
  )

  const tone = state?.tone ?? "default"
  const Icon = toneIcon(tone)

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        // 只用 open 受控；关闭时一律视为"取消"。
        open={state !== null}
        onOpenChange={(open) => {
          if (!open) resolveAndClose(false)
        }}
      >
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className={`flex size-7 items-center justify-center rounded-full ${toneBadgeClass(
                  tone,
                )}`}
              >
                <Icon className="size-4" />
              </span>
              {state?.title}
            </DialogTitle>
            {state?.description ? (
              <DialogDescription className="pt-1 leading-relaxed">
                {state.description}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => resolveAndClose(false)}
            >
              {state?.cancelText ?? "取消"}
            </Button>
            <Button
              type="button"
              variant={tone === "destructive" ? "destructive" : "default"}
              onClick={() => resolveAndClose(true)}
              autoFocus
            >
              {state?.confirmText ?? "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

function toneIcon(tone: ConfirmTone) {
  switch (tone) {
    case "destructive":
    case "warning":
      return IconAlertTriangle
    case "info":
      return IconInfoCircle
    default:
      return IconQuestionMark
  }
}

function toneBadgeClass(tone: ConfirmTone): string {
  switch (tone) {
    case "destructive":
      return "bg-destructive/10 text-destructive"
    case "warning":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
    case "info":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}
