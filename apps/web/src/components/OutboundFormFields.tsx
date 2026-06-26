import React from 'react'



import { XhsOrderMatchPanel } from '@/components/XhsOrderMatchPanel'

import type { SalesChannel } from '@/lib/outboundFormMemory'



type Props = {

  priceText: string

  orderNo: string

  remarkText: string

  salesPerson: string

  salesChannel: SalesChannel

  salesPersonOptions?: string[]

  disabled?: boolean

  orderPanelActive?: boolean

  orderLoadHovering?: boolean

  orderLoadSecondsLeft?: number

  onPriceChange: (v: string) => void

  onOrderNoChange: (v: string) => void

  onRemarkChange: (v: string) => void

  onSalesPersonChange: (v: string) => void

  onSalesChannelChange: (v: SalesChannel) => void

}



function Field({ label, children }: { label: string; children: React.ReactNode }) {

  return (

    <label className="block text-sm">

      <span className="text-slate-500">{label}</span>

      <div className="mt-1">{children}</div>

    </label>

  )

}



const inputClass =

  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-300'



export const OutboundFormFields: React.FC<Props> = ({

  priceText,

  orderNo,

  remarkText,

  salesPerson,

  salesChannel,

  salesPersonOptions = [],

  disabled,

  orderPanelActive = true,

  orderLoadHovering = false,

  orderLoadSecondsLeft = 2,

  onPriceChange,

  onOrderNoChange,

  onRemarkChange,

  onSalesPersonChange,

  onSalesChannelChange,

}) => {

  const personListId = 'outbound-sales-persons'



  return (

    <div data-no-scan-refocus className="grid gap-2">

      <Field label="售价">

        <input

          className={inputClass}

          placeholder="数字"

          value={priceText}

          disabled={disabled}

          onChange={(e) => onPriceChange(e.target.value)}

        />

      </Field>



      <Field label="订单编号">

        <input

          className={inputClass}

          placeholder="可选，可从小红书订单匹配填入"

          value={orderNo}

          disabled={disabled}

          onChange={(e) => onOrderNoChange(e.target.value)}

        />

      </Field>



      <XhsOrderMatchPanel

        active={orderPanelActive}

        hoverWaiting={orderLoadHovering}

        hoverSecondsLeft={orderLoadSecondsLeft}

        priceText={priceText}

        orderNo={orderNo}

        onPickOrder={(no, _buyerNick, price) => {
          onOrderNoChange(no)
          if (price) onPriceChange(price)
        }}

      />



      <Field label="备注">

        <input

          className={inputClass}

          placeholder="出库备注，写入 Excel H 列"

          value={remarkText}

          disabled={disabled}

          onChange={(e) => onRemarkChange(e.target.value)}

        />

      </Field>



      <Field label="销售人员">

        <input

          className={inputClass}

          list={personListId}

          placeholder="如：飞云、子杰"

          value={salesPerson}

          disabled={disabled}

          onChange={(e) => onSalesPersonChange(e.target.value)}

        />

        <datalist id={personListId}>

          {salesPersonOptions.map((name) => (

            <option key={name} value={name} />

          ))}

        </datalist>

      </Field>



      <Field label="销售渠道">

        <select

          className={inputClass}

          value={salesChannel}

          disabled={disabled}

          onChange={(e) => onSalesChannelChange(e.target.value as SalesChannel)}

        >

          <option value="线上">线上</option>

          <option value="线下">线下</option>

        </select>

      </Field>

    </div>

  )

}


