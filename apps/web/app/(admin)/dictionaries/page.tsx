import { options, PrefetchHydrate } from "@/lib/query"
import { DictManager } from "@/features/dicts/components/dict-manager"

/**
 * 字典管理页：
 *  - 服务端预取字典类型列表，首屏即可渲染左侧侧栏
 *  - 客户端 DictManager 自行按选中 code 拉 items 列表并负责 CRUD
 */
export default function DictionariesPage() {
  return (
    <PrefetchHydrate
      prefetch={async (qc) => {
        await qc.prefetchQuery(options.dicts.dictTypeListOptions())
      }}
    >
      <DictManager />
    </PrefetchHydrate>
  )
}
