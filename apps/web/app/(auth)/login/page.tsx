import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

/**
 * 登录页占位。字段 + 样式仅为结构示例，真实实现请：
 * - 用 zod schema 定义 `LoginSchema`，放到 `features/auth/schemas/`。
 * - 通过 Server Action 或 `useMutation(apiRequest(...))` 提交。
 * - 成功后 `router.replace("/dashboard")` 或 Server Action `redirect(...)`。
 */
export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">登录 hh-admin</h1>
        <p className="text-sm text-muted-foreground">
          使用后台账号继续
        </p>
      </div>
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            邮箱
          </label>
          <Input id="email" type="email" placeholder="admin@hh.local" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            密码
          </label>
          <Input id="password" type="password" placeholder="••••••••" />
        </div>
        <Button type="submit" className="mt-2 w-full">
          登录
        </Button>
      </form>
    </div>
  )
}
