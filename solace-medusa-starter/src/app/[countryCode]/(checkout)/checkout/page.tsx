import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { enrichLineItems, retrieveCart } from '@lib/data/cart'
import { getCustomer } from '@lib/data/customer'
import { getLocalizedPath } from '@lib/util/urls'
import Wrapper from '@modules/checkout/components/payment-wrapper'
import CheckoutForm from '@modules/checkout/templates/checkout-form'
import CheckoutSummary from '@modules/checkout/templates/checkout-summary'
import EmptyCartMessage from '@modules/cart/components/empty-cart-message'
import { Container } from '@modules/common/components/container'

export const metadata: Metadata = {
  title: 'Checkout',
}

const fetchCart = async () => {
  const cart = await retrieveCart()
  
  // Don't throw 404 - cart might have just been completed
  // This prevents race condition where payment succeeds and cart is removed
  // but page tries to re-render before redirect completes
  if (!cart) {
    return null
  }

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(cart?.items, cart?.region_id)
    cart.items = enrichedItems
  }

  return cart
}

export default async function Checkout(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])

  const { countryCode } = params

  // ── Authenticated Checkout Guard (server-side) ────────────────────────────
  // The proxy middleware handles the initial redirect, but we also guard here
  // so that any direct server-render of this page enforces authentication even
  // if the middleware is somehow bypassed (e.g. during SSR with stale cookies).
  const customer = await getCustomer().catch(() => null)

  if (!customer) {
    // Build a redirectTo param so the login page can return the user here after
    // successful authentication.
    const checkoutPath = getLocalizedPath('/checkout', countryCode)
    const step = searchParams?.step
    const fullCheckoutPath = step
      ? `${checkoutPath}?step=${step}`
      : checkoutPath

    redirect(
      getLocalizedPath(
        `/account?redirectTo=${encodeURIComponent(fullCheckoutPath)}`,
        countryCode
      )
    )
  }
  // ── End Checkout Guard ────────────────────────────────────────────────────

  const cart = await fetchCart()

  // No cart: just completed into an order, or the cookie points at another
  // customer's cart. Show the empty-bag message instead of a blank page;
  // rendering (not redirecting) keeps an in-flight placeOrder() redirect intact.
  if (!cart) {
    return (
      <Container className="flex min-h-[50vh] items-center justify-center py-16">
        <EmptyCartMessage />
      </Container>
    )
  }

  return (
    <Container className="mx-0 grid max-w-full grid-cols-1 gap-y-4 bg-secondary large:grid-cols-[1fr_416px] large:gap-x-10 2xl:gap-x-40">
      <Wrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} />
        <CheckoutSummary cart={cart} searchParams={searchParams} />
      </Wrapper>
    </Container>
  )
}
