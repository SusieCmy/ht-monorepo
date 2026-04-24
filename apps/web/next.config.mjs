/** @type {import('next').NextConfig} */

// 后端 API 地址。开发环境用 Next 的 rewrites 把 `/api/*` 反代到后端，
// 浏览器永远发给同源的 `/api/...`，彻底绕开 CORS；生产部署如果前后端同域，
// 保持 `NEXT_PUBLIC_API_BASE_URL` 留空即可，否则填真实地址。
const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://120.26.25.63:4839"

const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/:path*`,
      },
    ]
  },
}

export default nextConfig
