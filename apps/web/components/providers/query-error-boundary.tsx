"use client"

import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { Component, type ErrorInfo, type ReactNode } from "react"

/**
 * 全局 React Query 错误边界。
 *
 * 对应规则 err-error-boundaries：配合 `useQueryErrorResetBoundary()` 和
 * `useQuery({ throwOnError: true })`，把查询错误冒泡到这里统一渲染兜底
 * UI，避免到处散落的 `if (error) return ...` 样板代码。
 *
 * 设计要点：
 * 1. 用 class 组件自己实现（React 目前还没有函数式的 ErrorBoundary API），
 *    避免新增 `react-error-boundary` 这种第三方依赖。
 * 2. 点击“重试”时先调用 `reset()` 通知 react-query 重置所有错误状态，
 *    然后清空本地 error state 让子树重新渲染，子 query 会自动重新发起。
 * 3. 默认的 fallback 只是一个最朴素的面板，业务里可以通过 `fallback`
 *    prop 传入定制样式（比如 shadcn 的 Card + Alert）。
 */

interface QueryErrorBoundaryProps {
  children: ReactNode
  /** 自定义的兜底 UI；不传则使用默认面板 */
  fallback?: (args: {
    error: Error
    reset: () => void
  }) => ReactNode
}

interface InnerBoundaryProps extends QueryErrorBoundaryProps {
  /** react-query 提供的全局 reset 函数 */
  onReset: () => void
}

interface InnerBoundaryState {
  error: Error | null
}

class InnerBoundary extends Component<InnerBoundaryProps, InnerBoundaryState> {
  state: InnerBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): InnerBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 生产环境可以在这里接入 Sentry / 自建日志平台
    if (process.env.NODE_ENV !== "production") {
      console.error("[QueryErrorBoundary] 捕获到错误：", error, info)
    }
  }

  private handleReset = () => {
    // 先让 react-query 清空所有已失败查询的错误状态
    this.props.onReset()
    // 再把本地 error state 置空，子树会重新挂载并触发 query 重新发起
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.handleReset })
    }

    return (
      <div
        role="alert"
        className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <h2 className="text-base font-medium">页面出了点问题</h2>
        <p className="text-muted-foreground max-w-md text-sm break-all">
          {error.message || "未知错误"}
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          className="border-border hover:bg-accent mt-1 rounded-md border px-3 py-1 text-sm transition-colors"
        >
          重试
        </button>
      </div>
    )
  }
}

/**
 * 对外暴露的函数式包装：在组件内调用 `useQueryErrorResetBoundary()` 拿到
 * reset 句柄后，再交给内部的 class 组件。
 */
export function QueryErrorBoundary({
  children,
  fallback,
}: QueryErrorBoundaryProps) {
  const { reset } = useQueryErrorResetBoundary()
  return (
    <InnerBoundary onReset={reset} fallback={fallback}>
      {children}
    </InnerBoundary>
  )
}
