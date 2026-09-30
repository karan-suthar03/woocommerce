'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

import { addToCart } from '@lib/data/cart'
import { useProductVariant } from '@lib/context/product-variant-context'
import { useCartStore } from '@lib/store/useCartStore'
import { HttpTypes } from '@medusajs/types'
import ItemQtySelect from '@modules/cart/components/item-qty-select'
import { Box } from '@modules/common/components/box'
import { Button } from '@modules/common/components/button'
import { Text } from '@modules/common/components/text'
import { toast } from '@modules/common/components/toast'
import { WishlistButton } from '@modules/common/components/wishlist-button'
import OptionSelect from '@modules/products/components/product-actions/option-select'
import { isEqual } from 'lodash'

import ProductPrice from '../product-price'

type VariantColor = {
  Name: string
  Type?: Array<{
    Image?: {
      url: string
      alternativeText?: string
    }
    Color?: string
  }>
}

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  cartItems: HttpTypes.StoreCartLineItem[]
  colors: VariantColor[]
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

const optionsAsKeymap = (
  variantOptions: HttpTypes.StoreProductVariant['options']
) => {
  return variantOptions?.reduce((acc: Record<string, string>, varopt: any) => {
    acc[varopt.option_id] = varopt.value
    return acc
  }, {})
}

export default function ProductActions({
  product,
  cartItems,
  colors,
  disabled,
}: ProductActionsProps) {
  const { openCartDropdown, setCart, refreshCart } = useCartStore()
  const { setSelectedVariant } = useProductVariant()
  const actionsRef = useRef<HTMLDivElement>(null)
  const [qty, setQty] = useState(1)
  const [options, setOptions] = useState<Record<string, string | undefined>>(() => {
    if (product.variants?.length === 1) {
      return optionsAsKeymap(product.variants[0].options) ?? {}
    } else if (product.variants && product.variants.length > 1) {
      const sortedVariants = [...product.variants].sort((a, b) =>
        (a.title || '').localeCompare(b.title || '')
      )
      const firstAlphabeticalVariant = sortedVariants[0]
      if (firstAlphabeticalVariant) {
        return optionsAsKeymap(firstAlphabeticalVariant.options) ?? {}
      }
    }
    return {}
  })
  const [isAdding, setIsAdding] = useState(false)
  const countryCode = useParams().countryCode as string

  // update the options when a variant is selected
  const setOptionValue = (optionId: string, value: string) => {
    setOptions((prev) => ({
      ...prev,
      [optionId]: value,
    }))
  }

  // add the selected variant to the cart
  const handleAddToCart = async () => {
    if (!selectedVariant?.id) {
      console.error('[ProductActions] No variant selected')
      return null
    }

    console.log('[ProductActions] Adding to cart:', {
      variantId: selectedVariant.id,
      variantTitle: selectedVariant.title,
      quantity: qty,
      countryCode,
    })

    setIsAdding(true)
    try {
      const updatedCart = await addToCart({
        variantId: selectedVariant.id,
        quantity: qty,
        countryCode,
      })
      
      console.log('[ProductActions] Successfully added to cart')
      
      // Immediately set the fresh enriched cart in Zustand, then open drawer
      if (updatedCart) {
        setCart(updatedCart)
      } else {
        await refreshCart()
      }
      openCartDropdown()
      toast('success', 'Product was added to cart!')
    } catch (error) {
      console.error('[ProductActions] Failed to add to cart:', error)
      
      const errorMessage = error instanceof Error 
          ? error.message 
          : 'Could not add product to cart'
      
      toast('error', errorMessage)
    } finally {
      setIsAdding(false)
    }
  }

  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) {
      return
    }

    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  // Broadcast the selected variant via context so ImageGallery can react
  useEffect(() => {
    setSelectedVariant(selectedVariant)
  }, [selectedVariant]) // eslint-disable-line react-hooks/exhaustive-deps

  // check if the selected variant is in stock
  const inStock = useMemo(() => {
    // If we don't manage inventory, we can always add to cart
    if (selectedVariant && !selectedVariant.manage_inventory) {
      return true
    }

    // If we allow back orders on the variant, we can add to cart
    if (selectedVariant?.allow_backorder) {
      return true
    }

    // If there is inventory available, we can add to cart
    if (
      selectedVariant?.manage_inventory &&
      (selectedVariant?.inventory_quantity || 0) > 0
    ) {
      return true
    }

    // Otherwise, we can't add to cart
    return false
  }, [selectedVariant])

  // Get the max quantity
  const maxQuantity = useMemo(() => {
    if (!selectedVariant || !cartItems) return 10

    const cartQuantity =
      cartItems.reduce((sum, item) => {
        if (item.variant_id === selectedVariant?.id) {
          return sum + item.quantity
        }
        return sum
      }, 0) || 0

    if (
      selectedVariant?.inventory_quantity !== null &&
      selectedVariant?.inventory_quantity !== undefined
    ) {
      return Math.max(0, selectedVariant.inventory_quantity - cartQuantity)
    }

    return 10 - cartQuantity
  }, [selectedVariant, cartItems])

  // Preselect the options if product variants change dynamically
  useEffect(() => {
    if (product.variants?.length === 1) {
      const variantOptions = optionsAsKeymap(product.variants[0].options)
      setOptions(variantOptions ?? {})
    } else if (product.variants && product.variants.length > 1) {
      const sortedVariants = [...product.variants].sort((a, b) =>
        (a.title || '').localeCompare(b.title || '')
      )
      const firstAlphabeticalVariant = sortedVariants[0]
      if (firstAlphabeticalVariant) {
        const variantOptions = optionsAsKeymap(firstAlphabeticalVariant.options)
        setOptions(variantOptions ?? {})
      }
    }
  }, [product.variants])

  const isDefaultOption = (option: HttpTypes.StoreProductOption) => {
    const title = option.title?.toLowerCase().trim()
    if (title === 'default option' || title === 'default') {
      return true
    }
    if (
      option.values?.length === 1 &&
      option.values[0].value?.toLowerCase().trim() === 'default option value'
    ) {
      return true
    }
    return false
  }

  const renderableOptions = useMemo(() => {
    return (product.options || []).filter((option) => !isDefaultOption(option))
  }, [product.options])

  return (
    <>
      <div className="flex flex-col gap-y-6" ref={actionsRef}>
        <ProductPrice product={product} variant={selectedVariant} />
        <div className="h-px bg-gray-100" />
        <div>
          {renderableOptions.length > 0 && (
            <div className="flex flex-col gap-y-5">
              {renderableOptions.map((option) => {
                return (
                  <div key={option.id}>
                    <OptionSelect
                      option={option}
                      current={options[option.id]}
                      updateOption={setOptionValue}
                      variantsColors={colors}
                      title={option.title ?? ''}
                      data-testid="product-options"
                      disabled={!!disabled || isAdding}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <Box className="flex items-center gap-x-3">
          <Box className="shrink-0">
            <ItemQtySelect
              qty={qty}
              maxQuantity={maxQuantity}
              action={setQty}
            />
          </Box>
          <Button
            onClick={handleAddToCart}
            disabled={
              !inStock ||
              !selectedVariant ||
              !!disabled ||
              isAdding ||
              maxQuantity === 0
            }
            className="h-12 w-full rounded-full text-sm font-semibold tracking-wide shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98]"
            isLoading={isAdding}
            data-testid="add-product-button"
          >
            {!selectedVariant
              ? 'Select variant'
              : !inStock
                ? 'Out of stock'
                : 'Add to cart'}
          </Button>
          <WishlistButton
            product={{
              id: product.id,
              handle: product.handle ?? '',
              title: product.title ?? '',
              thumbnail: product.thumbnail ?? null,
              variantId: selectedVariant?.id,
              variantTitle: selectedVariant?.title ?? undefined,
            }}
          />
        </Box>
        {maxQuantity === 0 && inStock && (
          <Text size="sm" className="text-negative">
            You cannot add more items to your cart - you already have the
            maximum number in cart.
          </Text>
        )}
      </div>
    </>
  )
}
