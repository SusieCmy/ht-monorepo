/**
 * 预警规则的 mutation hook。
 *
 * 对应后端：
 *   POST   /alert-rule/bulk-upsert            批量 upsert（threshold=null 代表删除）
 *   DELETE /alert-rule/:sheetId/:productName  按商品删除
 *
 * 保存成功后需要同时失效：
 *  - `queryKeys.alertRules.list({ sheetId })`：弹窗下次打开能看到新配置；
 *  - `queryKeys.alertHits.lists()`：预警页立即按新阈值重算命中集合。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { apiRequest, queryKeys } from "@/lib/query"
import type { AlertRule } from "@/lib/query/options/alert-rules"

/** 单条 upsert 输入：threshold=null 代表删除该商品规则。 */
export interface UpsertAlertRuleItem {
  productName: string
  threshold: number | null
}

export interface BulkUpsertAlertRulesInput {
  sheetId: number
  rules: UpsertAlertRuleItem[]
}

export function useBulkUpsertAlertRules(sheetId: number) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.alertRules.list({ sheetId })

  return useMutation({
    mutationFn: (input: BulkUpsertAlertRulesInput) =>
      apiRequest<AlertRule[]>("/alert-rule/bulk-upsert", {
        method: "POST",
        body: {
          sheetId: input.sheetId,
          rules: input.rules.map((r) => ({
            productName: r.productName,
            threshold: r.threshold,
          })),
        },
      }),
    // 后端直接返回 upsert 之后的完整规则列表；用它替掉本地缓存，
    // 省一次刷新请求。
    onSuccess: (data) => {
      queryClient.setQueryData<AlertRule[]>(listKey, data)
    },
    onSettled: () => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        // 阈值变了，预警命中集合肯定跟着变，挂在预警页的 alertHitsOptions
        // 会自动重新 fetch。
        queryClient.invalidateQueries({
          queryKey: queryKeys.alertHits.lists(),
        }),
      ])
    },
  })
}

export interface DeleteAlertRuleInput {
  sheetId: number
  productName: string
}

/** 按商品单独删：弹窗里用户点"移除"按钮时用。 */
export function useDeleteAlertRule(sheetId: number) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.alertRules.list({ sheetId })

  return useMutation({
    mutationFn: (input: DeleteAlertRuleInput) =>
      apiRequest<{ ok: boolean }>(
        `/alert-rule/${input.sheetId}/${encodeURIComponent(input.productName)}`,
        { method: "DELETE" },
      ),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<AlertRule[]>(listKey)
      queryClient.setQueryData<AlertRule[]>(listKey, (current) =>
        current?.filter((r) => r.productName !== input.productName),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(listKey, ctx.previous)
      }
    },
    onSettled: () => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.alertHits.lists(),
        }),
      ])
    },
  })
}
