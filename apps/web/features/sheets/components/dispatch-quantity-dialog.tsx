"use client"

/**
 * 出库数量选择弹窗：
 *  - 显示当前行库存；
 *  - 让用户输入要出库的数量（1 ≤ qty ≤ 当前库存）；
 *  - 返回 Promise：resolve(qty) 提交，resolve(null) 取消。
 *
 * 业务约束：
 *  - 不允许 0 或负数 —— 那就是"什么都不做"，直接取消更清楚；
 *  - 不允许 > 当前库存 —— 后端没有允许负库存的语义，这里先做 UI 拦截；
 *  - 小数是否允许？看库存列类型，这里统一允许小数（和 MariaDB DECIMAL 保持一致），
 *    一般用到小数的是按重量/面积出库的原材料，整数商品用户自然会只填整数。
 */

import { useEffect, useId, useState } from "react"

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

export interface DispatchQuantityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前行库存，用于限制最大可出库数量和做 UI 展示。 */
  currentStock: number
  /** 辅助展示：商品名、行 id 等，纯 UI 用途。 */
  rowSummary?: React.ReactNode
  /** 确认时回调，传入用户选择的数量；弹窗关闭后 onOpenChange(false)。 */
  onConfirm: (qty: number) => void | Promise<void>
  /** 外部 pending 状态（提交中禁用按钮/关闭）。 */
  submitting?: boolean
}

export function DispatchQuantityDialog({
  open,
  onOpenChange,
  currentStock,
  rowSummary,
  onConfirm,
  submitting = false,
}: DispatchQuantityDialogProps) {
  const qtyId = useId()
  const [qty, setQty] = useState<string>("")
  const [error, setError] = useState<string>("")

  // 每次打开重置：默认填"全部出库"，这是最常用的默认值，
  // 用户觉得少则改小，比让他每次都手填方便。
  useEffect(() => {
    if (open) {
      setQty(currentStock > 0 ? String(currentStock) : "")
      setError("")
    }
  }, [open, currentStock])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(qty)
    if (!qty.trim() || !Number.isFinite(n)) {
      setError("请输入合法数字")
      return
    }
    if (n <= 0) {
      setError("出库数量必须大于 0")
      return
    }
    if (n > currentStock) {
      setError(`出库数量不能超过当前库存（${currentStock}）`)
      return
    }
    setError("")
    await onConfirm(n)
  }

  const handleOpenChange = (next: boolean) => {
    // 提交中不让关闭，避免请求未落盘就关掉导致状态错乱。
    if (submitting) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>出库数量</DialogTitle>
            <DialogDescription>
              出库数量等于当前库存时整行迁移；小于当前库存则按差额拆分，
              剩余部分仍保留在入库表。
            </DialogDescription>
          </DialogHeader>

          {rowSummary ? (
            <div className="bg-muted/40 text-muted-foreground rounded-md border p-2 text-xs">
              {rowSummary}
            </div>
          ) : null}

          <div>
            <Label htmlFor={qtyId} className="text-foreground">
              出库数量
            </Label>
            <Input
              id={qtyId}
              className="mt-1.5"
              type="number"
              min={0}
              max={currentStock}
              step="any"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value)
                if (error) setError("")
              }}
              autoFocus
              disabled={submitting}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              当前库存：
              <span className="text-foreground font-medium">
                {currentStock}
              </span>
              。允许 1 到 {currentStock} 之间的值。
            </p>
            {error ? (
              <p className="text-destructive mt-1.5 text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting || currentStock <= 0}>
              {submitting ? "出库中…" : "确认出库"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
