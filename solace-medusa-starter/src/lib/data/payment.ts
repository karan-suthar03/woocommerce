'use server'

import { sdk } from '@lib/config'
import { getAuthHeaders } from './cookies'

// Shipping / payment actions
export async function listCartPaymentMethods(regionId: string) {
  return sdk.store.payment
    .listPaymentProviders(
      { region_id: regionId },
      { next: { tags: ['payment_providers'] } }
    )
    .then(({ payment_providers }) => payment_providers)
    .catch(() => {
      return null
    })
}

/**
 * verifyRazorpayPayment
 *
 * Server action that calls the backend payment-verification endpoint.
 * The backend re-computes the HMAC-SHA256 signature using the secret key
 * (which lives only on the server) and confirms the payment was genuine.
 *
 * WHY IT MUST BE A SERVER ACTION:
 * - The backend URL is server-side (no CORS issue)
 * - We forward the auth cookie so Medusa can identify the customer
 * - The secret key is never sent to the browser
 *
 * @returns { verified: true } on success, throws on failure
 */
export async function verifyRazorpayPayment({
  razorpay_payment_id,
  razorpay_order_id,
  razorpay_signature,
}: {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}): Promise<{ verified: boolean; error?: string }> {
  const authHeaders = await getAuthHeaders()

  try {
    const data = await sdk.client.fetch<{ verified: boolean }>(
      '/store/custom/razorpay-verify',
      {
        method: 'POST',
        headers: authHeaders as Record<string, string>,
        body: {
          razorpay_payment_id,
          razorpay_order_id,
          razorpay_signature,
        },
      }
    )

    return { verified: data?.verified ?? true }
  } catch (err: any) {
    console.error('[verifyRazorpayPayment] Verification request failed:', err)
    return {
      verified: false,
      error:
        err?.message ||
        'Payment signature verification failed. Please contact support.',
    }
  }
}

