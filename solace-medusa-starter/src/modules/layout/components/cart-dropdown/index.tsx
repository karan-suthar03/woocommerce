'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { deleteLineItem, updateLineItem } from '@lib/data/cart'
import { useCartStore } from '@lib/store/useCartStore'
import { isDefaultVariantTitle } from '@lib/util/is-default-variant'
import { convertToLocale } from '@lib/util/money'
import { HttpTypes } from '@medusajs/types'
import LocalizedClientLink from '@modules/common/components/localized-client-link'
import { BagIcon, MinusThinIcon, PlusIcon, TrashIcon, XIcon } from '@modules/common/icons'
import Thumbnail from '@modules/products/components/thumbnail'

// ─── Cart Item Row ─────────────────────────────────────────────────────────────

const CartItemRow = ({
  item,
  currencyCode,
  onRefresh,
}: {
  item: HttpTypes.StoreCartLineItem
  currencyCode: string
  onRefresh: () => Promise<void>
}) => {
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const qty = item.quantity
  const maxQty =
    !item.variant?.manage_inventory || item.variant?.allow_backorder
      ? 10
      : Math.max(0, item.variant?.inventory_quantity ?? 0)

  const handleQtyChange = async (newQty: number) => {
    if (newQty < 1 || newQty > maxQty || isUpdating) return

    const previousCart = useCartStore.getState().cart

    // 1. Optimistic update
    useCartStore.getState().updateItemQuantityOptimistic(item.id, newQty)

    setIsUpdating(true)
    try {
      await updateLineItem({ lineId: item.id, quantity: newQty })
      await onRefresh()
    } catch {
      // Revert on error
      useCartStore.setState({ cart: previousCart })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    const previousCart = useCartStore.getState().cart

    // 1. Optimistic delete
    useCartStore.getState().deleteItemOptimistic(item.id)

    setIsDeleting(true)
    try {
      await deleteLineItem(item.id)
      await onRefresh()
    } catch {
      // Revert on error
      useCartStore.setState({ cart: previousCart })
    } finally {
      setIsDeleting(false)
    }
  }

  const unitPrice = item.unit_price ?? 0
  const lineTotal = unitPrice * qty

  return (
    <div
      className={`flex gap-3 py-4 transition-opacity duration-200 ${
        isDeleting ? 'opacity-30 pointer-events-none' : ''
      }`}
      data-testid="cart-item"
    >
      {/* Product Image */}
      <LocalizedClientLink
        href={`/products/${item.variant?.product?.handle ?? ''}`}
        className="shrink-0"
      >
        <div className="h-[96px] w-[80px] overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
          <Thumbnail
            thumbnail={item.variant?.thumbnail || item.variant?.product?.thumbnail}
            images={item.variant?.product?.images}
            size="square"
            className="h-full w-full rounded-none object-cover transition-transform duration-200 hover:scale-105"
          />
        </div>
      </LocalizedClientLink>

      {/* Details */}
      <div className="flex flex-1 flex-col justify-between min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <LocalizedClientLink
              href={`/products/${item.variant?.product?.handle ?? ''}`}
              data-testid="product-link"
            >
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 hover:text-[#6B0014] transition-colors">
                {item.product_title}
              </p>
            </LocalizedClientLink>
            {item.variant?.title && !isDefaultVariantTitle(item.variant.title) && (
              <p className="mt-0.5 inline-block text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                {item.variant.title}
              </p>
            )}
          </div>

          {/* Delete button */}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            aria-label="Remove item"
            className="shrink-0 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
            data-testid="cart-item-remove-button"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Qty + Price row */}
        <div className="mt-2 flex items-center justify-between">
          {/* Qty selector */}
          <div className="inline-flex items-center rounded-full border border-gray-200 bg-white shadow-2xs h-8">
            <button
              type="button"
              onClick={() => handleQtyChange(qty - 1)}
              disabled={qty <= 1 || isUpdating}
              aria-label="Decrease quantity"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <MinusThinIcon className="h-3 w-3" />
            </button>
            <span
              className="min-w-[2.5ch] text-center text-xs font-bold text-gray-900"
              aria-live="polite"
              data-testid="cart-item-quantity"
            >
              {qty}
            </span>
            <button
              type="button"
              onClick={() => handleQtyChange(qty + 1)}
              disabled={qty >= maxQty || isUpdating}
              aria-label="Increase quantity"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <PlusIcon className="h-3 w-3" />
            </button>
          </div>

          {/* Line total */}
          <span
            className="text-sm font-bold text-gray-900"
            data-testid="cart-item-price"
          >
            {convertToLocale({ amount: lineTotal, currency_code: currencyCode })}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────────

const EmptyCart = ({ onClose }: { onClose: () => void }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-16 text-center">
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#6B0014]/10 via-[#D4AF37]/15 to-transparent border border-[#D4AF37]/30 text-[#6B0014]">
      <BagIcon className="h-9 w-9" />
    </div>
    <div>
      <p className="text-lg font-bold text-gray-900">Your bag is empty</p>
      <p className="mt-1 text-xs text-gray-500 max-w-[240px]">
        Looks like you haven&apos;t added anything to your cart yet.
      </p>
    </div>
    <button
      onClick={onClose}
      className="mt-2 rounded-xl bg-[#0A0A0A] px-6 py-2.5 text-xs font-semibold text-white border border-[#D4AF37]/40 shadow-sm transition-all hover:bg-[#6B0014] hover:text-[#D4AF37] active:scale-95"
    >
      Continue Shopping
    </button>
  </div>
)

// ─── Cart Drawer ───────────────────────────────────────────────────────────────

const CartDropdown = ({
  cart: cartProp,
}: {
  cart?: HttpTypes.StoreCart | null
}) => {
  const {
    isOpenCartDropdown,
    openCartDropdown: _open,
    closeCartDropdown,
    cart: storeCart,
    isCartLoading,
    setCart,
    refreshCart,
  } = useCartStore()

  const drawerRef = useRef<HTMLDivElement>(null)
  const [isMounted, setIsMounted] = useState(false)

  // Track hydration state
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Synchronization with SSR cart data (only initialize if client store is empty)
  useEffect(() => {
    if (cartProp && !storeCart) {
      setCart(cartProp)
    }
  }, [cartProp, storeCart, setCart])

  // Refresh whenever the drawer is opened if no items loaded yet
  useEffect(() => {
    if (isOpenCartDropdown && (!storeCart || !storeCart.items?.length)) {
      refreshCart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpenCartDropdown])

  // Body scroll lock
  useEffect(() => {
    if (isOpenCartDropdown) {
      document.body.classList.add('cart-drawer-open')
    } else {
      document.body.classList.remove('cart-drawer-open')
    }
    return () => document.body.classList.remove('cart-drawer-open')
  }, [isOpenCartDropdown])

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpenCartDropdown) closeCartDropdown()
    },
    [isOpenCartDropdown, closeCartDropdown]
  )
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const activeCart = storeCart ?? cartProp

  const items = activeCart?.items
    ? [...activeCart.items].sort((a, b) =>
        (a.created_at ?? '') > (b.created_at ?? '') ? -1 : 1
      )
    : []

  const totalItems = items.length
  const subtotal = activeCart?.subtotal ?? 0
  const currencyCode = activeCart?.currency_code ?? 'usd'

  return (
    <>
      {/* Cart Icon Button */}
      <button
        onClick={() =>
          isOpenCartDropdown ? closeCartDropdown() : refreshCart().then(() => _open())
        }
        aria-label="Open cart"
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-action-primary transition-colors hover:bg-gray-100 active:bg-gray-200"
        data-testid="nav-cart-link"
        id="cart-drawer-trigger"
      >
        <div className="relative inline-flex items-center justify-center">
          <BagIcon className="h-6 w-6 text-gray-800" />
          {totalItems > 0 && isMounted && (
            <span
              key={totalItems}
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#6B0014] border border-[#D4AF37] text-[11px] font-bold text-white shadow-xs select-none animate-badge-pop"
            >
              {totalItems}
            </span>
          )}
        </div>
      </button>

      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={closeCartDropdown}
        className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs transition-opacity duration-300 ${
          isOpenCartDropdown ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        data-testid="nav-cart-dropdown"
        className={`fixed right-0 top-0 bottom-0 z-[70] flex h-full w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out sm:w-[420px] large:w-[460px] border-l border-gray-200/80 ${
          isOpenCartDropdown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>My Bag</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            </h2>
            {totalItems > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#6B0014] px-1.5 text-[11px] font-bold text-[#D4AF37]">
                {totalItems}
              </span>
            )}
          </div>
          <button
            onClick={closeCartDropdown}
            aria-label="Close cart"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            id="cart-drawer-close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body ── */}
        {isCartLoading && !activeCart ? (
          // Loading skeleton
          <div className="flex-1 overflow-y-auto px-5">
            {[1, 2].map((i) => (
              <div key={i} className="flex animate-pulse gap-3 py-4 border-b border-gray-100">
                <div className="h-[96px] w-[80px] shrink-0 rounded-xl bg-gray-200" />
                <div className="flex flex-1 flex-col gap-2 pt-1">
                  <div className="h-4 w-3/4 rounded bg-gray-200" />
                  <div className="h-3 w-1/2 rounded bg-gray-100" />
                  <div className="mt-auto h-8 w-28 rounded-full bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="flex-1 overflow-y-auto px-5 no-scrollbar">
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  currencyCode={currencyCode}
                  onRefresh={refreshCart}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyCart onClose={closeCartDropdown} />
        )}

        {/* ── Footer ── */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50/50 px-5 pb-6 pt-4 space-y-3">
            {/* Subtotal */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Subtotal</span>
              <span
                className="text-base font-bold text-gray-900"
                data-testid="cart-subtotal"
              >
                {convertToLocale({ amount: subtotal, currency_code: currencyCode })}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Shipping and taxes calculated at checkout.
            </p>

            {/* Checkout CTA */}
            <LocalizedClientLink href="/checkout" onClick={closeCartDropdown}>
              <button
                className="mt-1 w-full rounded-xl bg-gradient-to-r from-[#0A0A0A] via-[#6B0014] to-[#0A0A0A] py-3.5 text-sm font-bold text-white shadow-md border border-[#D4AF37]/30 transition-all hover:shadow-lg active:scale-[0.98]"
                data-testid="checkout-button"
                id="cart-checkout-button"
              >
                Checkout
              </button>
            </LocalizedClientLink>

            {/* View cart link */}
            <LocalizedClientLink href="/cart" onClick={closeCartDropdown}>
              <p className="text-center text-xs font-semibold text-gray-500 hover:text-[#6B0014] hover:underline cursor-pointer mt-1">
                View full cart
              </p>
            </LocalizedClientLink>
          </div>
        )}
      </div>
    </>
  )
}

export default CartDropdown
