"use client"

import { useState } from "react"

import { IconRefresh, IconSearch } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

// 字典型候选值集中在这里，后续接入字典接口时只需把这两个常量换成
// useQuery 的结果即可（form 不需要改动）。
export const SUPPLIER_OPTIONS = ["华源", "顺丰", "京东物流"] as const
export const STATUS_OPTIONS = ["已入库", "在途", "待检"] as const

export interface InboundCriteria {
  keyword?: string
  supplier?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

// Radix Select 不允许空字符串作为 item value，用一个哨兵字符串代表
// “不筛选这列”，提交时转回 undefined。
const ALL = "__all__"

interface InboundFilterFormProps {
  onSubmit: (criteria: InboundCriteria) => void
  onReset: () => void
}

export function InboundFilterForm({ onSubmit, onReset }: InboundFilterFormProps) {
  const [keyword, setKeyword] = useState("")
  const [supplier, setSupplier] = useState<string>(ALL)
  const [status, setStatus] = useState<string>(ALL)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  function handleSubmit() {
    onSubmit({
      keyword: keyword.trim() || undefined,
      supplier: supplier === ALL ? undefined : supplier,
      status: status === ALL ? undefined : status,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
  }

  function handleReset() {
    setKeyword("")
    setSupplier(ALL)
    setStatus(ALL)
    setDateFrom("")
    setDateTo("")
    onReset()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
      className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inbound-keyword">关键词</Label>
        <Input
          id="inbound-keyword"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="单号 / SKU / 商品名"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inbound-supplier">供应商</Label>
        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger id="inbound-supplier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部</SelectItem>
            {SUPPLIER_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="inbound-status">状态</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="inbound-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部</SelectItem>
            {STATUS_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>入库日期</Label>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="起始日期"
          />
          <span className="text-muted-foreground text-xs">~</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="结束日期"
          />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <Button type="submit">
          <IconSearch className="size-4" />
          查询
        </Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          <IconRefresh className="size-4" />
          重置
        </Button>
      </div>
    </form>
  )
}
