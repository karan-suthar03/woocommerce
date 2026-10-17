'use client'

import React, { useCallback, useMemo, useState, useRef, useContext } from 'react'
import { useRazorpay } from 'react-razorpay'
import { HttpTypes } from '@medusajs/types'
import { getUnavailableCartItems, placeOrder } from '@lib/data/cart'
import { verifyRazorpayPayment } from '@lib/data/payment'
import {
  getCustomerFriendlyError,
  getNetworkFailureMessage,
  getCancellationMessage,
} from '@lib/util/error-messages'
import { Button } from '@modules/common/components/button'
import { Text } from '@modules/common/components/text'
import ErrorMessage from '../error-message'
import { CheckoutContext } from '../payment-wrapper'

import { convertToLocale } from '@lib/util/money'

type RazorpayPaymentButtonProps = {
  cart: HttpTypes.StoreCart
  session: HttpTypes.StorePaymentSession
  notReady: boolean
  'data-testid'?: string
}

const RazorpayPaymentButton: React.FC<RazorpayPaymentButtonProps> = ({
  cart,
  session,
  notReady,
  'data-testid': dataTestId,
}) => {
  const { Razorpay } = useRazorpay()
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [processingState, setProcessingState] = useState<string | null>(null)

  /**
   * IDEMPOTENCY GUARD — prevents duplicate orders.
   */
  const orderPlacedRef = useRef(false)

  const orderId =
    ((session?.data as any)?.razorpayOrder?.id as string) ||
    ((session?.data as any)?.order_id as string) ||
    ((session?.data as any)?.id as string) ||
    undefined

  const customerName = [
    cart.billing_address?.first_name,
    cart.billing_address?.last_name,
  ]
    .filter(Boolean)
    .join(' ')

  const checkoutContext = useContext(CheckoutContext)

  /**
   * Display amount matches Order Summary (CartTotals) 1:1.
   * cart.total is in standard units (100 = ₹100.00).
   */
  const formattedTotal = convertToLocale({
    amount: cart.total ?? 0,
    currency_code: cart.currency_code ?? 'INR',
  })

  const options = useMemo<any>(() => {
    return {
      key:
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
        process.env.NEXT_PUBLIC_RAZORPAY_TEST_KEY_ID ||
        '',
      // NOTE: We do NOT pass `amount` here. The amount is already set on the
      // Razorpay order (razorpayOrder.amount) created server-side. Passing a
      // client-side amount would open an attack surface.
      order_id: orderId,
      currency: cart.currency_code?.toUpperCase() || 'INR',
      name: process.env.NEXT_PUBLIC_SHOP_NAME || 'Store',
      description:
        process.env.NEXT_PUBLIC_SHOP_DESCRIPTION || 'Complete your order',
      prefill: {
        name: customerName || undefined,
        email: cart.email ?? undefined,
        contact:
          cart.shipping_address?.phone ?? cart.billing_address?.phone ?? undefined,
      },
      theme: {
        color: '#2563eb',
      },
      modal: {
        ondismiss: () => {
          // Only allow reset if the order hasn't been placed yet
          if (!orderPlacedRef.current) {
            setSubmitting(false)
            setProcessingState(null)
            setErrorMessage(getCancellationMessage())
          }
        },
      },

      /**
       * FIXED PAYMENT HANDLER
       *
       * Previous flow (broken):
       *   Razorpay success → placeOrder() immediately
       *
       * Problems with previous flow:
       *  1. No signature verification → security hole (forged callbacks)
       *  2. Payment session may not be AUTHORIZED yet → cart.complete returns
       *     type:'cart' → placeOrder() returns null → "Failed to place order"
       *  3. Cart never cleared because removeCartId() was inside the null branch
       *
       * New flow (fixed):
       *   Razorpay success
       *     → verifyRazorpayPayment() [server action → backend HMAC check]
       *       → placeOrder() [with retry logic, up to 4 attempts × 1.5s]
       *         → onOrderCompleted() → redirect to /order/confirmed/[id]
       *                             → removeCartId() clears cart cookie ✅
       */
      handler: async (response: any) => {
        // --- Idempotency guard ---
        if (orderPlacedRef.current) {
          console.warn(
            '[Razorpay] handler fired again after order already placed — ignoring'
          )
          return
        }

        console.log('[Razorpay] Payment callback received:', {
          paymentId: response.razorpay_payment_id,
          orderId: response.razorpay_order_id,
          hasSignature: !!response.razorpay_signature,
          timestamp: new Date().toISOString(),
        })

        if (!response?.razorpay_payment_id) {
          setErrorMessage('Payment was not completed. Please try again.')
          setSubmitting(false)
          return
        }

        // --- Step 1: Verify payment signature server-side ---
        setProcessingState('Verifying payment...')

        try {
          const result = await verifyRazorpayPayment({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          })

          if (!result?.verified) {
            console.error('[Razorpay] Signature verification failed:', result?.error)
            setErrorMessage(
              result?.error ||
              'Payment verification failed. If you were charged, please contact support with payment ID: ' +
              response.razorpay_payment_id
            )
            setSubmitting(false)
            setProcessingState(null)
            return
          }
        } catch (verifyError: any) {
          console.error('[Razorpay] Signature verification exception:', verifyError)
          setErrorMessage(
            verifyError?.message ||
            'Payment verification encountered an unexpected error. Payment ID: ' +
            response.razorpay_payment_id
          )
          setSubmitting(false)
          setProcessingState(null)
          return
        }

        // --- Step 2: Lock idempotency guard before placing order ---
        orderPlacedRef.current = true
        setProcessingState('Creating your order...')

        // --- Step 3: Place order (with built-in retry logic in cart.ts) ---
        try {
          console.log('[Razorpay] Signature verified. Placing order...')
          const order = await placeOrder()

          if (order && order.id) {
            console.log('[Razorpay] Order placed successfully:', {
              orderId: order.id,
              paymentId: response.razorpay_payment_id,
              timestamp: new Date().toISOString(),
            })
            setProcessingState('Order confirmed! Redirecting...')
            // Cart is already cleared inside placeOrder() via removeCartId()
            checkoutContext?.onOrderCompleted(order)
          } else {
            // placeOrder() should always throw rather than return null now,
            // but guard defensively.
            console.error('[Razorpay] placeOrder returned unexpectedly empty')
            setErrorMessage(
              'Your payment was received but we could not confirm your order. ' +
              'Please contact support with payment ID: ' +
              response.razorpay_payment_id
            )
          }
        } catch (orderError: any) {
          console.error('[Razorpay] Order creation failed after payment:', {
            paymentId: response.razorpay_payment_id,
            error: orderError.message,
            timestamp: new Date().toISOString(),
          })
          setErrorMessage(getNetworkFailureMessage(response.razorpay_payment_id))
        } finally {
          setSubmitting(false)
          setProcessingState(null)
        }
      },
    }
  }, [cart, customerName, orderId, checkoutContext])

  const handlePayment = useCallback(async () => {
    setErrorMessage(null)
    setProcessingState(null)

    if (!Razorpay) {
      setErrorMessage('Razorpay is not available. Please try again later.')
      return
    }

    if (!orderId) {
      setErrorMessage('Unable to initialize payment. Please refresh and try again.')
      return
    }

    const activeKey = options.key
    if (!activeKey) {
      setErrorMessage(
        'Payment gateway is not configured. Please contact support.'
      )
      return
    }

    setSubmitting(true)

    // Razorpay takes the money at once, but stock is only checked when the
    // order is created — so catch sold-out items before the customer pays.
    try {
      setProcessingState('Checking availability...')
      const unavailable = await getUnavailableCartItems()
      if (unavailable.length) {
        setErrorMessage(
          `Sorry, ${unavailable.join(', ')} ${unavailable.length > 1 ? 'are' : 'is'} no longer available in the quantity in your bag. Please update your bag before paying.`
        )
        setSubmitting(false)
        setProcessingState(null)
        return
      }
    } catch (stockError) {
      // A failed check must not block payment; the order step still validates stock.
      console.warn('[Razorpay] Stock pre-check failed, continuing:', stockError)
    }
    setProcessingState(null)

    // Reset idempotency guard for a fresh payment attempt
    orderPlacedRef.current = false

    const isTestKey = activeKey.startsWith('rzp_test_')
    console.log('[Razorpay] Opening payment modal', {
      keyType: isTestKey ? 'TEST' : 'LIVE',
      orderId,
      currency: cart.currency_code?.toUpperCase(),
      displayAmount: formattedTotal,
      timestamp: new Date().toISOString(),
    })

    if (!isTestKey) {
      console.warn(
        '[Razorpay] WARNING: Using a LIVE key in what appears to be a non-production environment'
      )
    }

    try {
      const razorpay = new Razorpay(options)

      razorpay.on('payment.failed', (response: any) => {
        console.error('[Razorpay] Payment failed:', {
          code: response?.error?.code,
          description: response?.error?.description,
          source: response?.error?.source,
          reason: response?.error?.reason,
          timestamp: new Date().toISOString(),
        })
        setErrorMessage(getCustomerFriendlyError(response))
        setSubmitting(false)
        setProcessingState(null)
        // Reset so the customer can retry
        orderPlacedRef.current = false
      })

      razorpay.open()
    } catch (error: any) {
      console.error('[Razorpay] Failed to open payment modal:', error)
      setErrorMessage(error?.message || 'Unable to start payment. Please try again.')
      setSubmitting(false)
    }
  }, [Razorpay, options, orderId, cart, formattedTotal])

  return (
    <>
      <Button
        disabled={notReady || submitting || !orderId}
        onClick={handlePayment}
        isLoading={submitting}
        data-testid={dataTestId}
      >
        {submitting ? 'Processing...' : `Pay ${formattedTotal}`}
      </Button>

      {processingState && (
        <Text size="sm" className="mt-2 text-secondary">
          {processingState}
        </Text>
      )}

      <ErrorMessage error={errorMessage} data-testid="razorpay-payment-error" />
    </>
  )
}

export default RazorpayPaymentButton



