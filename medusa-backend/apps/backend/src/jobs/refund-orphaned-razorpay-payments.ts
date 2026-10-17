import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import Razorpay from "razorpay"

/**
 * Safety net for "paid but no order".
 *
 * Razorpay auto-captures as soon as the customer pays, but the order is only
 * created afterwards. If that fails (item sold out meanwhile, browser closed
 * and the webhook could not complete the cart either) the money sits captured
 * with no order. This job finds such Razorpay payments and refunds them.
 *
 * A session qualifies when it is older than MIN_AGE_MINUTES (so in-flight
 * checkouts are left alone), its cart has no order, and Razorpay shows a
 * captured, not-yet-refunded payment for it.
 */
const MIN_AGE_MINUTES = Number(process.env.ORPHAN_REFUND_MIN_AGE_MINUTES ?? 15)
const MAX_AGE_DAYS = 3

export default async function refundOrphanedRazorpayPayments(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const live = process.env.RAZORPAY_MODE === "live"
  const key_id = live ? process.env.RAZORPAY_ID : process.env.RAZORPAY_TEST_KEY_ID
  const key_secret = live ? process.env.RAZORPAY_SECRET : process.env.RAZORPAY_TEST_KEY_SECRET
  if (!key_id || !key_secret) {
    return
  }
  const razorpay = new Razorpay({ key_id, key_secret })

  const now = Date.now()
  const { data: sessions } = await query.graph({
    entity: "payment_session",
    fields: ["id", "data", "payment_collection_id", "created_at"],
    filters: {
      provider_id: "pp_razorpay_razorpay",
      created_at: {
        $lte: new Date(now - MIN_AGE_MINUTES * 60_000),
        $gte: new Date(now - MAX_AGE_DAYS * 86_400_000),
      },
    } as any,
  })

  for (const session of sessions) {
    const rzpOrderId = (session.data as any)?.razorpayOrder?.id
    if (!rzpOrderId) continue

    const { data: links } = await query.graph({
      entity: "cart_payment_collection",
      fields: ["cart_id"],
      filters: { payment_collection_id: session.payment_collection_id },
    })
    const cartId = links[0]?.cart_id
    if (!cartId) continue

    const { data: orderLinks } = await query.graph({
      entity: "order_cart",
      fields: ["order_id"],
      filters: { cart_id: cartId },
    })
    if (orderLinks.length) continue // the cart became an order: nothing to do

    let payments: any[] = []
    try {
      payments = (await razorpay.orders.fetchPayments(rzpOrderId)).items ?? []
    } catch (e: any) {
      logger.warn(`[orphan-refund] Could not fetch payments for ${rzpOrderId}: ${e?.error?.description ?? e?.message}`)
      continue
    }

    for (const p of payments) {
      const refundable = Number(p.amount) - Number(p.amount_refunded ?? 0)
      if (p.status !== "captured" || refundable <= 0) continue
      try {
        await razorpay.payments.refund(p.id, {
          amount: refundable,
          notes: { reason: "paid_without_order", medusa_cart_id: cartId, medusa_payment_session_id: session.id },
        })
        logger.warn(`[orphan-refund] Refunded ${refundable / 100} ${p.currency} for payment ${p.id} (cart ${cartId} has no order)`)
      } catch (e: any) {
        logger.error(`[orphan-refund] Refund failed for ${p.id}: ${e?.error?.description ?? e?.message}`)
      }
    }
  }
}

export const config = {
  name: "refund-orphaned-razorpay-payments",
  schedule: "*/10 * * * *",
}
