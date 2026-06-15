import React from 'react'

import type { Bracelet } from '@/api/types'

import { LabelPrintPanel } from '@/components/LabelPrintPanel'

const TEST_BRACELET: Bracelet = {
  id: 'debug',
  certNo: 'F00035',
  qty: 1,
  category: '天然和田玉手镯',
  ringSize: '50',
  cost: '9000',
  detail: {
    id: 'debug-detail',
    braceletId: 'debug',
    weightGram: '60',
  },
}

export const LabelPrintDebugPanel: React.FC = () => {
  return (
    <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">吊牌测试打印</h3>
      <p className="mt-1 text-xs text-slate-500">
        内置 25×70mm 模板，测试数据：F00035 / 圈口 50 / 售价 9000 元。请保持璞趣桌面与 print-agent 运行。
      </p>
      <div className="mt-4">
        <LabelPrintPanel bracelet={TEST_BRACELET} label="测试打印" />
      </div>
    </section>
  )
}
