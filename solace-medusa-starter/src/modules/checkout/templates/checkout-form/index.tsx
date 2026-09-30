import { listCartShippingMethods } from '@lib/data/fulfillment'
import { listCartPaymentMethods } from '@lib/data/payment'
import { HttpTypes } from '@medusajs/types'
import { sdk } from '@lib/config'
import { getAuthHeaders } from '@lib/data/cookies'
import Addresses from '@modules/checkout/components/addresses'
import Payment from '@modules/checkout/components/payment'
import { Box } from '@modules/common/components/box'

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) {
    return null
  }

  const regionId = cart.region?.id ?? cart.region_id ?? ''
  const shippingMethods = (await listCartShippingMethods(cart.id)) || []
  const paymentMethods = (await listCartPaymentMethods(regionId)) || []

  // Automatically apply default shipping method if address is set but shipping_methods is empty.
  // NOTE: We call the SDK directly here instead of setShippingMethod() because
  // setShippingMethod() calls revalidateTag('cart') which is forbidden during
  // server-component render (Next.js App Router constraint). The cache will be
  // revalidated naturally on the next navigation / Server Action.
  if (
    cart.shipping_address &&
    (!cart.shipping_methods || cart.shipping_methods.length === 0) &&
    shippingMethods.length > 0
  ) {
    try {
      const authHeaders = await getAuthHeaders()
      await sdk.store.cart.addShippingMethod(
        cart.id,
        { option_id: shippingMethods[0].id },
        {},
        authHeaders
      )
    } catch {
      // Non-fatal — the user can still select a shipping method manually.
    }
  }

  return (
    <Box className="grid w-full grid-cols-1 gap-y-4">
      <Addresses cart={cart} customer={customer} />
      <Payment cart={cart} availablePaymentMethods={paymentMethods} />
    </Box>
  )
}
