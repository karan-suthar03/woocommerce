// Runs the orphaned-payment refund job once: npx medusa exec ./src/scripts/run-orphan-refund.ts
import refundOrphanedRazorpayPayments from "../jobs/refund-orphaned-razorpay-payments"

export default async function run({ container }: any) {
  await refundOrphanedRazorpayPayments(container)
}
