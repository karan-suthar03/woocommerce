import { paymentInfoMap, getPaymentStatusLabel } from '@lib/constants'
import { HttpTypes } from '@medusajs/types'
import { Box } from '@modules/common/components/box'
import { Button } from '@modules/common/components/button'
import LocalizedClientLink from '@modules/common/components/localized-client-link'

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder
}

const PaymentDetails = ({ order }: PaymentDetailsProps) => {
  const payment = order.payment_collections?.[0]?.payments?.[0]
  const paymentStatus = order.payment_status ?? order.payment_collections?.[0]?.status

  const paymentTitle = payment?.provider_id
    ? paymentInfoMap[payment.provider_id]?.title || payment.provider_id
    : 'Online Payment'

  return (
    <Box className="bg-primary border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
      <h3 className="font-bold text-sm sm:text-base text-neutral-900 dark:text-white pb-3 border-b border-neutral-100 dark:border-neutral-800/60">
        Payment & Invoicing
      </h3>
      <div className="flex flex-col gap-2 text-xs sm:text-sm">
        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
          <span>Payment Method</span>
          <span className="font-medium text-neutral-900 dark:text-white">
            {paymentTitle}
          </span>
        </div>
        {paymentStatus && (
          <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
            <span>Payment Status</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase text-xs">
              {getPaymentStatusLabel(paymentStatus)}
            </span>
          </div>
        )}
      </div>
      <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <Button variant="tonal" size="sm" asChild className="w-full text-xs sm:text-sm h-8 sm:h-9">
          <LocalizedClientLink href={`/account/orders/invoice/${order.id}`}>
            View & Download Invoice &rarr;
          </LocalizedClientLink>
        </Button>
      </div>
    </Box>
  )
}

export default PaymentDetails
