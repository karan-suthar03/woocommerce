'use client'

import React, { useState } from 'react'
import { HttpTypes } from '@medusajs/types'
import { cancelOrder } from '@lib/data/orders'
import { Button } from '@modules/common/components/button'
import { Box } from '@modules/common/components/box'
import { Text } from '@modules/common/components/text'
import { Heading } from '@modules/common/components/heading'

type CancelOrderButtonProps = {
  order: HttpTypes.StoreOrder & { status: string }
}

/**
 * CancelOrderButton Component
 * 
 * Shows a cancel button for orders that meet these criteria:
 * - Order is successfully created (status: pending/processing)
 * - Payment is completed
 * - Order has NOT been fulfilled yet
 * 
 * Handles:
 * - Confirmation dialog
 * - Duplicate cancellation prevention
 * - Success/error messaging
 * - Order cache revalidation
 */
const CancelOrderButton: React.FC<CancelOrderButtonProps> = ({ order }) => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Determine if cancel button should be shown
  const canCancelOrder = (): boolean => {
    // Order must not be cancelled already
    if (order.status === 'canceled') {
      return false
    }

    // Order must not be completed
    if (order.status === 'completed') {
      return false
    }

    // Check payment status - order must be paid
    const paymentStatus = (order.payment_status ?? order.payment_collections?.[0]?.status) as string
    const isPaid =
      paymentStatus === 'captured' ||
      paymentStatus === 'authorized' ||
      paymentStatus === 'paid' ||
      paymentStatus === 'completed' ||
      paymentStatus === 'partially_captured'

    if (!isPaid) {
      return false
    }

    // Check fulfillment status - order must NOT be fulfilled
    const fulfillmentStatus = (order as any).fulfillment_status

    // Show button only if not fulfilled, or if explicitly not_fulfilled
    if (!fulfillmentStatus || fulfillmentStatus === 'not_fulfilled') {
      return true
    }

    // If fulfillment has started, hide button
    if (
      fulfillmentStatus === 'fulfilled' ||
      fulfillmentStatus === 'partially_fulfilled' ||
      fulfillmentStatus === 'shipped' ||
      fulfillmentStatus === 'partially_shipped' ||
      fulfillmentStatus === 'delivered'
    ) {
      return false
    }

    return true
  }

  const handleCancelClick = () => {
    setMessage(null)
    setShowConfirmDialog(true)
  }

  const handleConfirmCancel = async () => {
    setIsSubmitting(true)
    setMessage(null)

    console.log('[Order] Cancellation initiated:', {
      orderId: order.id,
      displayId: order.display_id,
      status: order.status,
      fulfillmentStatus: (order as any).fulfillment_status,
      timestamp: new Date().toISOString(),
    })

    try {
      const result = await cancelOrder(order.id)

      if (result.success) {
        console.log('[Order] Cancellation successful:', {
          orderId: order.id,
          timestamp: new Date().toISOString(),
        })

        setMessage({
          type: 'success',
          text: result.message,
        })

        // Close dialog
        setShowConfirmDialog(false)

        // Refresh the page after a short delay to show updated status
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        console.warn('[Order] Cancellation failed:', {
          orderId: order.id,
          reason: result.message,
          timestamp: new Date().toISOString(),
        })

        setMessage({
          type: 'error',
          text: result.message,
        })
      }
    } catch (error: any) {
      console.error('[Order] Cancellation error:', {
        orderId: order.id,
        error: error.message,
        timestamp: new Date().toISOString(),
      })

      setMessage({
        type: 'error',
        text: 'An unexpected error occurred. Please try again or contact support.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelDialog = () => {
    setShowConfirmDialog(false)
    setMessage(null)
  }

  // Don't render if order cannot be cancelled
  if (!canCancelOrder()) {
    return null
  }

  return (
    <Box className="mt-6">
      {/* Cancel Order Button */}
      {!showConfirmDialog && (
        <Button
          variant="ghost"
          onClick={handleCancelClick}
          className="border border-red-500 text-red-500 hover:bg-red-50"
          data-testid="cancel-order-button"
        >
          Cancel Order
        </Button>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <Box
          className="rounded-lg border border-ui-border-base bg-primary p-6"
          data-testid="cancel-order-dialog"
        >
          <Heading as="h3" className="mb-3 text-xl">
            Cancel Order #{order.display_id}?
          </Heading>

          <Text className="mb-4 text-secondary">
            Are you sure you want to cancel this order? This action cannot be
            undone.
          </Text>

          <Box className="mb-4 rounded-md bg-ui-bg-subtle p-4">
            <Text className="text-sm text-secondary">
              <strong>Important:</strong> If you paid for this order, a refund
              will be processed manually within 5-7 business days. You will
              receive a confirmation email once the refund is initiated.
            </Text>
          </Box>

          <Box className="flex gap-3">
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={isSubmitting}
              isLoading={isSubmitting}
              data-testid="confirm-cancel-button"
            >
              {isSubmitting ? 'Cancelling...' : 'Yes, Cancel Order'}
            </Button>
            <Button
              variant="ghost"
              onClick={handleCancelDialog}
              disabled={isSubmitting}
              data-testid="cancel-dialog-button"
            >
              No, Keep Order
            </Button>
          </Box>
        </Box>
      )}

      {/* Success/Error Message */}
      {message && (
        <Box
          className={`mt-4 rounded-md p-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
          data-testid={`cancel-order-${message.type}-message`}
        >
          <Text className="text-sm font-medium">{message.text}</Text>
        </Box>
      )}
    </Box>
  )
}

export default CancelOrderButton
