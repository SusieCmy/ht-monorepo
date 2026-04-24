"use client"

/**
 * 预警设置弹窗：
 *  - 左侧列出「商品名称字典」(dict_type.code = product_name) 的所有字典项；
 *  - 每个商品右侧一个阈值输入框；
 *  - 底部可配置「默认阈值」：对没有单独设阈值的商品兜底。
 *
 * 为什么从字典拿而不是从入库表 DISTINCT：
 *  - 返库 / 手填很容易让"同一个商品"写成两个字符串（"键盘" vs "键盘 "），
 *    按表内 DISTINCT 会出现重复选项，且阈值配完了以后名字变化规则就"飘"了；
 *  - 改成字典：配置阈值和实际存储的商品名同一份来源，不会飘；字典项增删
 *    可以在字典管理页统一维护。
 *
 * 保存时一次性调 POST /alert-rule/bulk-upsert：
 *  - 用户填了数字 → upsert 该商品阈值；
 *  - 原本有规则但用户清空 / 改成非法值 → 传 threshold:null 让后端删；
 *  - 默认阈值是页面级设置，不进 alert_rule 表（由调用方自行维护）。
 */

const DEFAULT_PRODUCT_DICT_CODE = "product_name"

import { useEffect, useId, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"

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
import type { AlertRule } from "@/lib/query/options/alert-rules"

import { useToast } from "@/components/feedback/toast-provider"
import { useBulkUpsertAlertRules } from "@/features/alerts/hooks/use-alert-rule-mutations"

export interface AlertSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sheetId: number
  /** 默认阈值（全局兜底）。由调用方保存在预警页状态里。 */
  defaultThreshold: number
  onDefaultThresholdChange: (value: number) => void
  /**
   * 可选：指定商品名称字典的 type code，默认 "product_name"。
   * 业务上一般不需要改；留一个口子是为了未来多租户场景（多套字典）。
   */
  productDictTypeCode?: string
}

/** 把规则数组归并成 Map<productName, thresholdString>，便于回显输入框。 */
function toThresholdMap(rules: AlertRule[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rules) {
    out[r.productName] = String(r.threshold)
  }
  return out
}

export function AlertSettingsDialog({
  open,
  onOpenChange,
  sheetId,
  defaultThreshold,
  onDefaultThresholdChange,
  productDictTypeCode = DEFAULT_PRODUCT_DICT_CODE,
}: AlertSettingsDialogProps) {
  const toast = useToast()
  const defaultInputId = useId()

  // 商品列表来源：product_name 字典。只在弹窗打开时才请求，
  // 避免页面首次进来就触发一次拉字典请求。
  const dictItemsQuery = useQuery({
    ...options.dicts.dictItemListOptions({ typeCode: productDictTypeCode }),
    enabled: open,
  })

  const rulesQuery = useQuery({
    ...options.alertRules.alertRuleListOptions({ sheetId }),
    enabled: open && Number.isFinite(sheetId) && sheetId > 0,
  })

  // 字典列存的是 label（见 sheet-grid 的 dict 列 cellEditor 注释），所以
  // 预警匹配和字典显示都以 label 为准，顺序按 sortOrder 升序。
  const productNames = useMemo(() => {
    const items = dictItemsQuery.data ?? []
    const deduped = new Map<string, number>()
    for (const it of items) {
      const label = (it.label ?? "").trim()
      if (!label) continue
      if (!deduped.has(label)) deduped.set(label, it.sortOrder ?? 0)
    }
    return [...deduped.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "zh"))
      .map(([label]) => label)
  }, [dictItemsQuery.data])

  // 用户编辑中的阈值草稿：key=商品名，value=字符串（空串=未设置）。
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [defaultDraft, setDefaultDraft] = useState(String(defaultThreshold))
  const [submitting, setSubmitting] = useState(false)

  // 弹窗每次打开，从服务端最新规则重建 drafts，避免留有上一次未保存的脏值。
  useEffect(() => {
    if (!open) return
    if (rulesQuery.isSuccess) {
      setDrafts(toThresholdMap(rulesQuery.data))
    }
    setDefaultDraft(String(defaultThreshold))
    // rulesQuery.data 是引用稳定的；加 isSuccess 保证至少首次拿到后再重置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rulesQuery.isSuccess, rulesQuery.data])

  const bulkUpsert = useBulkUpsertAlertRules(sheetId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const defaultNum = Number(defaultDraft)
    if (defaultDraft.trim() === "" || !Number.isFinite(defaultNum) || defaultNum < 0) {
      toast.error({
        title: "默认阈值非法",
        description: "请输入一个 ≥ 0 的数字作为默认阈值",
      })
      return
    }

    // 组装 upsert payload：
    //  - 当前所有商品名都参与一次 upsert 判断；
    //  - 草稿为空串 → threshold=null（如果后端存在则删除，不存在则忽略）；
    //  - 草稿非法数字 → 拒绝整批提交，让用户改。
    const rulesToSubmit: Array<{
      productName: string
      threshold: number | null
    }> = []
    for (const name of productNames) {
      const draft = drafts[name]
      if (draft === undefined || draft.trim() === "") {
        rulesToSubmit.push({ productName: name, threshold: null })
        continue
      }
      const n = Number(draft)
      if (!Number.isFinite(n) || n < 0) {
        toast.error({
          title: `「${name}」阈值非法`,
          description: "请输入 ≥ 0 的数字，或清空表示使用默认阈值",
        })
        return
      }
      rulesToSubmit.push({ productName: name, threshold: n })
    }

    // 同时清理掉"后端有但现在商品名已经消失"的规则：把规则里不在 productNames 中的项显式 null 掉。
    const currentSet = new Set(productNames)
    for (const rule of rulesQuery.data ?? []) {
      if (!currentSet.has(rule.productName)) {
        rulesToSubmit.push({ productName: rule.productName, threshold: null })
      }
    }

    setSubmitting(true)
    try {
      await bulkUpsert.mutateAsync({ sheetId, rules: rulesToSubmit })
      onDefaultThresholdChange(defaultNum)
      toast.success({
        title: "预警设置已保存",
        description: "预警页会按新的阈值重新筛选命中数据。",
      })
      onOpenChange(false)
    } catch (err) {
      toast.error({
        title: "保存失败",
        description: err instanceof Error ? err.message : "未知错误",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const loading = dictItemsQuery.isPending || rulesQuery.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-xl" showCloseButton>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>预警设置</DialogTitle>
            <DialogDescription>
              为每个商品配置独立的低库存阈值：库存 ≤ 阈值 时出现在预警页
              （已触达阈值即视为命中）。未单独设置的商品会使用下方「默认阈值」。
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor={defaultInputId} className="text-foreground">
              默认阈值
            </Label>
            <Input
              id={defaultInputId}
              className="mt-1.5"
              type="number"
              min={0}
              step="any"
              value={defaultDraft}
              onChange={(e) => setDefaultDraft(e.target.value)}
              placeholder="例如：10"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              留空等同于把阈值设成 0（不触发任何预警）。
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-foreground">商品阈值</Label>
            <span className="text-muted-foreground text-xs">
              共 {productNames.length} 个商品
            </span>
          </div>

          <div className="max-h-[360px] overflow-y-auto rounded-md border">
            {loading ? (
              <div className="text-muted-foreground flex h-24 items-center justify-center text-sm">
                正在加载商品列表…
              </div>
            ) : productNames.length === 0 ? (
              <div className="text-muted-foreground flex h-24 flex-col items-center justify-center gap-1 text-center text-sm">
                <div>「商品名称」字典里还没有任何商品。</div>
                <div className="text-xs">
                  可前往入库管理页点「启用商品字典」一键同步，
                  或到字典管理页手动添加。
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {productNames.map((name) => (
                  <li
                    key={name}
                    className="flex items-center justify-between gap-3 p-2"
                  >
                    <span className="flex-1 truncate text-sm" title={name}>
                      {name}
                    </span>
                    <Input
                      className="w-28"
                      type="number"
                      min={0}
                      step="any"
                      value={drafts[name] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [name]: e.target.value,
                        }))
                      }
                      placeholder="默认"
                    />
                    {drafts[name] ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive text-xs"
                        onClick={() =>
                          setDrafts((prev) => {
                            const next = { ...prev }
                            delete next[name]
                            return next
                          })
                        }
                      >
                        清除
                      </button>
                    ) : (
                      <span className="w-8" />
                    )}
                  </li>
                ))}
              </ul>
            )}
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
            <Button type="submit" disabled={submitting || loading}>
              {submitting ? "保存中…" : "保存设置"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
