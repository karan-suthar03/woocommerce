import { convertToLocale } from '@lib/util/money'
import { HttpTypes } from '@medusajs/types'
import { Box } from '@modules/common/components/box'
import { Button } from '@modules/common/components/button'
import LocalizedClientLink from '@modules/common/components/localized-client-link'

type OrderSummaryProps = {
  order: HttpTypes.StoreOrder
}

const OrderSummary = ({ order }: OrderSummaryProps) => {
  const getAmount = (amount?: number | null) => {
    if (amount === undefined || amount === null) {
      return '-'
    }

    return convertToLocale({
      amount,
      currency_code: order.currency_code,
    })
  }

  const sumCollections = (key: 'captured_amount' | 'refunded_amount') =>
    (order.payment_collections ?? []).reduce(
      (sum, pc) => sum + Number((pc as any)[key] ?? 0),
      0
    )
  const paidAmount = sumCollections('captured_amount')
  const refundedAmount = sumCollections('refunded_amount')

  return (
    <Box className="bg-primary border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-3.5">
      <h3 className="font-bold text-sm sm:text-base text-neutral-900 dark:text-white pb-3 border-b border-neutral-100 dark:border-neutral-800/60">
        Order Summary
      </h3>
      <Box className="flex flex-col gap-2 text-xs sm:text-sm">
        <Box className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
          <span>Items Subtotal</span>
          <span className="font-semibold text-neutral-900 dark:text-white font-mono">
            {getAmount(order.item_total)}
          </span>
        </Box>
        {order.discount_total > 0 && (
          <Box className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span>Discount</span>
            <span className="font-semibold font-mono">
              - {getAmount(order.discount_total)}
            </span>
          </Box>
        )}
        {order.gift_card_total > 0 && (
          <Box className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span>Gift Card</span>
            <span className="font-semibold font-mono">
              - {getAmount(order.gift_card_total)}
            </span>
          </Box>
        )}
        <Box className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
          <span>Shipping</span>
          <span className="font-semibold text-neutral-900 dark:text-white font-mono">
            {getAmount(order.shipping_total)}
          </span>
        </Box>
        {(order.tax_total ?? 0) > 0 && (
          <Box className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
            <span>Taxes</span>
            <span className="font-semibold text-neutral-900 dark:text-white font-mono">
              {getAmount(order.tax_total)}
            </span>
          </Box>
        )}
      </Box>
      <Box className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <span className="font-bold text-sm sm:text-base text-neutral-900 dark:text-white">Total Amount</span>
        <span className="font-bold text-base sm:text-lg text-neutral-900 dark:text-white font-mono">
          {/* A refund is booked as a credit, which lowers order.total; show what was paid instead. */}
          {getAmount(refundedAmount > 0 ? paidAmount : order.total)}
        </span>
      </Box>
      {refundedAmount > 0 && (
        <>
          <Box className="flex items-center justify-between text-neutral-600 dark:text-neutral-400 text-xs sm:text-sm">
            <span>Refunded</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono" data-testid="order-refunded-amount">
              - {getAmount(refundedAmount)}
            </span>
          </Box>
          <Box className="flex items-center justify-between text-xs sm:text-sm">
            <span className="font-semibold text-neutral-900 dark:text-white">Net Paid</span>
            <span className="font-bold text-neutral-900 dark:text-white font-mono">
              {getAmount(paidAmount - refundedAmount)}
            </span>
          </Box>
        </>
      )}
      <div className="pt-1">
        <Button variant="tonal" size="sm" asChild className="w-full text-xs sm:text-sm h-8 sm:h-9">
          <LocalizedClientLink href={`/account/orders/invoice/${order.id}`}>
            View & Download Invoice &rarr;
          </LocalizedClientLink>
        </Button>
      </div>
    </Box>
  )
}

export default OrderSummary
