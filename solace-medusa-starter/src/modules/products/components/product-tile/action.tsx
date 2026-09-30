'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

import { addToCartCheapestVariant } from '@lib/data/cart'
import { useCartStore } from '@lib/store/useCartStore'
import { cn } from '@lib/util/cn'
import LocalizedClientLink from '@modules/common/components/localized-client-link'
import { toast } from '@modules/common/components/toast'
import { BagIcon, EyeIcon, Spinner } from '@modules/common/icons'

export function ProductActions({
  productHandle,
  regionId,
  variantCount = 1,
}: {
  productHandle: string
  regionId: string
  variantCount?: number
}) {
  const [isAddingToCart, setIsAddingToCart] = useState(false)
  const { openCartDropdown, setCart, refreshCart } = useCartStore()
  const countryCode = useParams().countryCode as string

  // ── Multi-variant: send the user to the PDP to choose their variant ──────
  if (variantCount > 1) {
    return (
      <LocalizedClientLink
        href={`/products/${productHandle}`}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold tracking-wide text-white whitespace-nowrap shadow-xs',
          'transition-all duration-200 hover:bg-gray-800 hover:shadow-sm active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
          'min-h-[36px] touch-manipulation'
        )}
        aria-label="View product options"
        data-testid="view-options-button"
      >
        <EyeIcon className="h-3.5 w-3.5 shrink-0" />
        <span>View Options</span>
      </LocalizedClientLink>
    )
  }

  // ── Single-variant: add directly to cart ─────────────────────────────────
  const handleAddToCart = async () => {
    setIsAddingToCart(true)

    try {
      const result = await addToCartCheapestVariant({
        productHandle,
        regionId,
        countryCode,
      })

      if (result.success) {
        if (result.cart) {
          setCart(result.cart)
        } else {
          await refreshCart()
        }
        openCartDropdown()
        toast('success', result.message || 'Product was added to cart!')
      } else {
        toast('error', result.error)
      }
    } catch (error) {
      toast('error', 'An unexpected error occurred')
    } finally {
      setIsAddingToCart(false)
    }
  }

  return (
    <button
      type="button"
      disabled={isAddingToCart}
      onClick={handleAddToCart}
      aria-label="Add to cart"
      data-testid="add-to-cart-button"
      className={cn(
        'flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold tracking-wide text-white whitespace-nowrap shadow-xs',
        'transition-all duration-200 hover:bg-gray-800 hover:shadow-sm active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'min-h-[36px] touch-manipulation'
      )}
    >
      {isAddingToCart ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : (
        <BagIcon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>{isAddingToCart ? 'Adding…' : 'Add to Cart'}</span>
    </button>
  )
}
