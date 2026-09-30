'use server'

import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { sdk } from '@lib/config'
import medusaError from '@lib/util/medusa-error'
import { getLocalizedPath } from '@lib/util/urls'
import { HttpTypes } from '@medusajs/types'
import { omit } from 'lodash'

import { getAuthHeaders, getCartId, removeCartId, setCartId } from './cookies'
import { getProductByHandle, getProductsById } from './products'
import { getRegion } from './regions'
import { getCustomer } from './customer'
import { listCartShippingMethods } from './fulfillment'
import { listCartPaymentMethods } from './payment'

export async function retrieveCart() {
  const cartId = await getCartId()

  if (!cartId) {
    return null
  }

  const authHeaders = await getAuthHeaders()

  let cart = await sdk.store.cart
    .retrieve(cartId, {}, { next: { tags: ['cart'] }, ...authHeaders })
    .then(({ cart }) => cart)
    .catch(async () => {
      // Fallback: try without authHeaders in case of cart authorization mismatch
      return sdk.store.cart
        .retrieve(cartId, {}, { next: { tags: ['cart'] } })
        .then(({ cart }) => cart)
        .catch(() => null)
    })

  if (cart) {
    const customer = await getCustomer().catch(() => null)
    if (cart.customer_id && customer && cart.customer_id !== customer.id) {
      try {
        await removeCartId()
      } catch {
        // Cookie mutation is not allowed during SSR rendering (only in Server
        // Actions / Route Handlers). Silently swallow the error here; the stale
        // cart ID will be cleaned up the next time this path is hit from an
        // action context.
      }
      return null
    }

    if (customer && (!cart.customer_id || cart.email !== customer.email)) {
      try {
        await sdk.store.cart.update(
          cart.id,
          { email: customer.email },
          {},
          authHeaders
        )
        cart.email = customer.email
        if (customer.id) {
          cart.customer_id = customer.id
        }
      } catch {
        // Swallow background link update errors
      }
    }
  }

  return cart
}

export async function getOrSetCart(countryCode: string) {
  let cart = await retrieveCart()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  const authHeaders = await getAuthHeaders()

  if (!cart) {
    const cartResp = await sdk.store.cart.create(
      { region_id: region.id },
      {},
      authHeaders
    )
    cart = cartResp.cart
    setCartId(cart.id)
    revalidateTag('cart', 'max')
  }

  if (cart && cart?.region_id !== region.id) {
    const authHeaders = await getAuthHeaders()

    await sdk.store.cart.update(
      cart.id,
      { region_id: region.id },
      {},
      authHeaders
    )
    revalidateTag('cart', 'max')
  }

  return cart
}

export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = await getCartId()
  if (!cartId) {
    throw new Error('No existing cart found, please create one before updating')
  }

  const authHeaders = await getAuthHeaders()

  return sdk.store.cart
    .update(cartId, data, {}, authHeaders)
    .then(({ cart }) => {
      revalidateTag('cart', 'max')
      return cart
    })
    .catch(medusaError)
}

export async function addToCart({
  variantId,
  quantity,
  countryCode,
}: {
  variantId: string
  quantity: number
  countryCode: string
}) {
  if (!variantId) {
    console.error('[addToCart] Missing variant ID')
    throw new Error('Missing variant ID when adding to cart')
  }

  console.log('[addToCart] Starting with:', { variantId, quantity, countryCode })

  const cart = await getOrSetCart(countryCode)
  if (!cart) {
    console.error('[addToCart] Failed to retrieve or create cart')
    throw new Error('Error retrieving or creating cart')
  }

  console.log('[addToCart] Cart retrieved:', cart.id)

  const authHeaders = await getAuthHeaders()
  console.log('[addToCart] Auth headers prepared:', Object.keys(authHeaders))

  const updatedCart = await sdk.store.cart
    .createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
      },
      {},
      authHeaders
    )
    .then(async ({ cart: resCart }) => {
      console.log('[addToCart] Successfully added item to cart')
      revalidateTag('cart', 'max')
      if (resCart.items?.length) {
        resCart.items = await enrichLineItems(resCart.items, resCart.region_id!)
      }
      return resCart
    })
    .catch((error) => {
      console.error('[addToCart] Error adding to cart:', error)
      medusaError(error)
    })

  return updatedCart
}

export async function addToCartCheapestVariant({
  productHandle,
  regionId,
  countryCode,
}: {
  productHandle: string
  regionId: string
  countryCode: string
}) {
  if (!productHandle || !regionId || !countryCode) {
    return {
      success: false,
      error: 'Missing required parameters',
    }
  }

  try {
    const detailedProduct = await getProductByHandle(productHandle, regionId)

    if (!detailedProduct) {
      return {
        success: false,
        error: 'Product not found',
      }
    }

    const variants = detailedProduct.variants
    if (!variants?.length) {
      return {
        success: false,
        error: 'Product has no variants',
      }
    }

    const pricedVariants = variants.filter(
      (v) => v.calculated_price?.original_amount != null
    )

    const cheapestVariant =
      pricedVariants.length > 0
        ? pricedVariants.reduce((cheapest, current) =>
            cheapest.calculated_price!.original_amount <
            current.calculated_price!.original_amount
              ? cheapest
              : current
          )
        : variants[0]

    const canAdd =
      !cheapestVariant.manage_inventory ||
      cheapestVariant.allow_backorder ||
      (cheapestVariant.inventory_quantity ?? 0) > 0

    if (!canAdd) {
      return {
        success: false,
        error: 'Product is out of stock',
      }
    }

    const updatedCart = await addToCart({
      variantId: cheapestVariant.id, // Add the cheapest variant to the cart
      quantity: 1,
      countryCode,
    })

    return {
      success: true,
      message: 'Product added to cart',
      cart: updatedCart,
    }
  } catch (error) {
    console.error('Error adding product to cart:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred',
    }
  }
}

export async function updateLineItem({
  lineId,
  quantity,
}: {
  lineId: string
  quantity: number
}) {
  if (!lineId) {
    throw new Error('Missing lineItem ID when updating line item')
  }

  const cartId = await getCartId()
  if (!cartId) {
    throw new Error('Missing cart ID when updating line item')
  }

  const authHeaders = await getAuthHeaders()

  const updatedCart = await sdk.store.cart
    .updateLineItem(cartId, lineId, { quantity }, {}, authHeaders)
    .then(async ({ cart }) => {
      revalidateTag('cart', 'max')
      if (cart.items?.length) {
        cart.items = await enrichLineItems(cart.items, cart.region_id!)
      }
      return cart
    })
    .catch(medusaError)

  return updatedCart
}

export async function deleteLineItem(lineId: string) {
  if (!lineId) {
    throw new Error('Missing lineItem ID when deleting line item')
  }

  const cartId = await getCartId()
  if (!cartId) {
    throw new Error('Missing cart ID when deleting line item')
  }

  const authHeaders = await getAuthHeaders()

  const updatedCart = await sdk.store.cart
    .deleteLineItem(cartId, lineId, {}, authHeaders)
    .then(async ({ parent: cart }) => {
      revalidateTag('cart', 'max')
      if (cart?.items?.length) {
        cart.items = await enrichLineItems(cart.items, cart.region_id!)
      }
      return cart
    })
    .catch(medusaError)

  revalidateTag('cart', 'max')
  return updatedCart
}

export async function enrichLineItems(
  lineItems:
    | HttpTypes.StoreCartLineItem[]
    | HttpTypes.StoreOrderLineItem[]
    | null,
  regionId: string
) {
  if (!lineItems) return []

  // Prepare query parameters
  const queryParams = {
    ids: lineItems.map((lineItem) => lineItem.product_id!),
    regionId: regionId,
  }

  // Fetch products by their IDs
  const products = await getProductsById(queryParams)
  // If there are no line items or products, return an empty array
  if (!lineItems?.length || !products) {
    return []
  }

  // Enrich line items with product and variant information
  const enrichedItems = lineItems.map((item) => {
    const product = products.find((p: any) => p.id === item.product_id)
    const variant = product?.variants?.find(
      (v: any) => v.id === item.variant_id
    )

    // If product or variant is not found, return the original item
    if (!product || !variant) {
      return item
    }

    // If product and variant are found, enrich the item
    return {
      ...item,
      variant: {
        ...variant,
        product: omit(product, 'variants'),
      },
    }
  }) as HttpTypes.StoreCartLineItem[]

  return enrichedItems
}

export async function setShippingMethod({
  cartId,
  shippingMethodId,
}: {
  cartId: string
  shippingMethodId: string
}) {
  const authHeaders = await getAuthHeaders()

  return sdk.store.cart
    .addShippingMethod(cartId, { option_id: shippingMethodId }, {}, authHeaders)
    .then(({ cart }) => {
      revalidateTag('cart', 'max')
      return cart
    })
    .catch((err) => {
      // Fallback: retry without auth headers if authorization header caused a cart ownership mismatch
      return sdk.store.cart
        .addShippingMethod(cartId, { option_id: shippingMethodId })
        .then(({ cart }) => {
          revalidateTag('cart', 'max')
          return cart
        })
        .catch(medusaError)
    })
}

export async function initiatePaymentSession(
  cartInput: HttpTypes.StoreCart,
  data: {
    provider_id: string
    context?: Record<string, unknown>
  }
) {
  const authHeaders = await getAuthHeaders()

  // Always retrieve the latest cart from server DB so we don't rely on a stale client-side cart prop
  const freshCart = await retrieveCart()
  const cart = freshCart || cartInput

  if (!cart) {
    throw new Error('No cart found to initiate payment session')
  }

  // If there is already an active pending session with the same provider, reuse it
  const existingPendingSession = cart?.payment_collection?.payment_sessions?.find(
    (s: any) => s.provider_id === data.provider_id && s.status === 'pending'
  )
  if (existingPendingSession) {
    return { payment_collection: cart.payment_collection }
  }

  return sdk.store.payment
    .initiatePaymentSession(cart, data, {}, authHeaders)
    .then((resp) => {
      try {
        revalidateTag('cart', 'max')
      } catch {}
      return resp
    })
    .catch(async (err) => {
      // If error occurred because session already exists or was created concurrently, verify cart state
      const recheckedCart = await retrieveCart().catch(() => null)
      const hasSession = recheckedCart?.payment_collection?.payment_sessions?.some(
        (s: any) => s.provider_id === data.provider_id
      )
      if (hasSession && recheckedCart?.payment_collection) {
        return { payment_collection: recheckedCart.payment_collection }
      }
      return medusaError(err)
    })
}

export async function applyPromotions(codes: string[]) {
  const cartId = await getCartId()
  if (!cartId) {
    throw new Error('No existing cart found')
  }

  await updateCart({ promo_codes: codes })
    .then(() => {
      revalidateTag('cart', 'max')
    })
    .catch(medusaError)
}

// export async function applyGiftCard(code: string) {
//   //   const cartId = getCartId()
//   //   if (!cartId) return "No cartId cookie found"
//   //   try {
//   //     await updateCart(cartId, { gift_cards: [{ code }] }).then(() => {
//   //       revalidateTag("cart")
//   //     })
//   //   } catch (error: any) {
//   //     throw error
//   //   }
// }

// export async function removeDiscount(code: string) {
//   // const cartId = getCartId()
//   // if (!cartId) return "No cartId cookie found"
//   // try {
//   //   await deleteDiscount(cartId, code)
//   //   revalidateTag("cart")
//   // } catch (error: any) {
//   //   throw error
//   // }
// }

// export async function removeGiftCard(
//   codeToRemove: string,
//   giftCards: any[]
//   // giftCards: GiftCard[]
// ) {
//   //   const cartId = getCartId()
//   //   if (!cartId) return "No cartId cookie found"
//   //   try {
//   //     await updateCart(cartId, {
//   //       gift_cards: [...giftCards]
//   //         .filter((gc) => gc.code !== codeToRemove)
//   //         .map((gc) => ({ code: gc.code })),
//   //     }).then(() => {
//   //       revalidateTag("cart")
//   //     })
//   //   } catch (error: any) {
//   //     throw error
//   //   }
// }

export async function submitPromotionForm(
  currentState: unknown,
  formData: FormData
) {
  const code = formData.get('code') as string
  try {
    await applyPromotions([code])
  } catch (e: any) {
    return e.message
  }
}

// TODO: Pass a POJO instead of a form entity here
export async function setAddresses(currentState: unknown, formData: FormData) {
  try {
    if (!formData) {
      throw new Error('No form data found when setting addresses')
    }
    const cartId = await getCartId()
    if (!cartId) {
      throw new Error('No existing cart found when setting addresses')
    }

    const data = {
      shipping_address: {
        first_name: formData.get('shipping_address.first_name'),
        last_name: formData.get('shipping_address.last_name'),
        address_1: formData.get('shipping_address.address_1'),
        address_2: '',
        company: formData.get('shipping_address.company'),
        postal_code: formData.get('shipping_address.postal_code'),
        city: formData.get('shipping_address.city'),
        country_code: formData.get('shipping_address.country_code'),
        province: formData.get('shipping_address.province'),
        phone: formData.get('shipping_address.phone'),
      },
      email: formData.get('email'),
    } as any

    const sameAsShipping = formData.get('same_as_shipping')
    if (sameAsShipping === 'on') data.billing_address = data.shipping_address

    if (sameAsShipping !== 'on')
      data.billing_address = {
        first_name: formData.get('billing_address.first_name'),
        last_name: formData.get('billing_address.last_name'),
        address_1: formData.get('billing_address.address_1'),
        address_2: '',
        company: formData.get('billing_address.company'),
        postal_code: formData.get('billing_address.postal_code'),
        city: formData.get('billing_address.city'),
        country_code: formData.get('billing_address.country_code'),
        province: formData.get('billing_address.province'),
        phone: formData.get('billing_address.phone'),
      }
    await updateCart(data)

    const updatedCart = await retrieveCart()
    if (
      updatedCart &&
      (!updatedCart.shipping_methods || updatedCart.shipping_methods.length === 0)
    ) {
      const shippingMethods = await listCartShippingMethods(updatedCart.id)
      if (shippingMethods && shippingMethods.length > 0) {
        await setShippingMethod({
          cartId: updatedCart.id,
          shippingMethodId: shippingMethods[0].id,
        })
      }
    }

    // Pre-initialize payment session on the server so that when transitioning to payment step,
    // the cart already contains an active payment session and Razorpay is ready immediately.
    const finalCart = await retrieveCart()
    if (finalCart && finalCart.region_id) {
      const paymentMethods = await listCartPaymentMethods(finalCart.region_id)
      if (paymentMethods && paymentMethods.length > 0) {
        const sortedMethods = [...paymentMethods].sort((a, b) => {
          const idA = a.provider_id || a.id || ''
          const idB = b.provider_id || b.id || ''
          return idA > idB ? 1 : -1
        })
        const defaultMethod = sortedMethods[0].id
        await initiatePaymentSession(finalCart, {
          provider_id: defaultMethod,
        }).catch((sessionErr) => {
          console.error('[setAddresses] Non-fatal payment session initialization error:', sessionErr)
        })
      }
    }
  } catch (e: any) {
    return e.message
  }

  const rawCountryCode = (formData.get('shipping_address.country_code') as string) || ''
  const countryCode = rawCountryCode.toLowerCase()

  redirect(getLocalizedPath('/checkout?step=payment', countryCode))
}

export async function placeOrder() {
  const cartId = await getCartId()
  if (!cartId) {
    throw new Error('No existing cart found when placing an order')
  }

  const authHeaders = await getAuthHeaders()

  /**
   * WHY RETRY LOGIC EXISTS:
   *
   * After a Razorpay payment succeeds, there is a short window where Medusa's
   * payment session is transitioning from REQUIRES_MORE → AUTHORIZED.
   * On localhost with live keys, webhooks cannot reach the backend, so
   * cart.complete() must poll until the Razorpay API reflects the capture.
   *
   * Strategy: 2s initial wait (INITIAL_DELAY_MS) + up to 6 attempts × 2s = 14s worst-case.
   * On production with webhooks configured, the webhook fires BEFORE this code
   * runs, so cart.complete() typically succeeds on the first attempt.
   *
   * If all retries fail: the error is caught in razorpay-payment-button.tsx
   * (catch block, line ~203). A safe "email incoming" message is shown, and
   * the Razorpay webhook creates the order automatically on the backend via
   * processPaymentWorkflow → completeCartAfterPaymentStep. No manual action needed.
   */
  const MAX_ATTEMPTS = 6 // 1 initial try + up to 5 retries
  const RETRY_DELAY_MS = 2000 // 2s between attempts

  // On live mode, allow Razorpay's auto-capture to settle before first attempt
  const INITIAL_DELAY_MS = 2000
  await new Promise((resolve) => setTimeout(resolve, INITIAL_DELAY_MS))

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const cartRes = await sdk.store.cart.complete(cartId, {}, authHeaders)

      if (cartRes?.type === 'order') {
        // ── Success path ──────────────────────────────────────────────────────
        // removeCartId() clears the _medusa_cart_id cookie so the cart header
        // shows 0 items immediately after the redirect to /order/confirmed/[id].
        revalidateTag('cart', 'max')
        await removeCartId()
        return JSON.parse(JSON.stringify(cartRes.order))
      }

      // If cartRes returned type: 'cart' without throwing, check if status is pending
      if (attempt < MAX_ATTEMPTS) {
        const paymentStatus = (cartRes as any)?.cart?.payment_collection?.payment_sessions?.[0]?.status
        console.log(
          `[placeOrder] cart.complete returned type='${cartRes?.type}' (payment status: ${paymentStatus ?? 'unknown'}) on attempt ${attempt}/${MAX_ATTEMPTS}. Retrying in ${RETRY_DELAY_MS}ms…`
        )
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      }
    } catch (err: any) {
      const errMsg = (
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        ''
      ).toLowerCase()

      const isRetryable =
        errMsg.includes('not authorized') ||
        errMsg.includes('requires_more') ||
        errMsg.includes('payment_session') ||
        errMsg.includes('payment session')

      if (isRetryable && attempt < MAX_ATTEMPTS) {
        console.log(
          `[placeOrder] cart.complete attempt ${attempt}/${MAX_ATTEMPTS} payment settling: ${err?.message}. Retrying in ${RETRY_DELAY_MS}ms…`
        )
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        continue
      }

      // Non-retryable error or final attempt exhausted — preserve standard Medusa error handling
      return medusaError(err)
    }
  }

  // All retries exhausted — payment was verified but Medusa never transitioned
  // the cart to an order.
  throw new Error(
    'Unable to complete your order. Your payment was received but the order ' +
      'could not be created. Please contact support with your payment details.'
  )
}

/**
 * Updates the countrycode param and revalidates the regions cache
 * @param regionId
 * @param countryCode
 */
export async function updateRegion(countryCode: string, currentPath: string) {
  const cartId = await getCartId()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (cartId) {
    await updateCart({ region_id: region.id })
    revalidateTag('cart', 'max')
  }

  revalidateTag('regions', 'max')
  revalidateTag('products', 'max')

  redirect(getLocalizedPath(currentPath, countryCode))
}
