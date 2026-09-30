import { NextResponse } from 'next/server'

import { enrichLineItems, retrieveCart } from '@lib/data/cart'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const cart = await retrieveCart()

    if (!cart) {
      return NextResponse.json(
        { cart: null },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
          },
        }
      )
    }

    // Enrich line items with product/variant details (images, options, etc.)
    if (cart.items?.length) {
      cart.items = await enrichLineItems(cart.items, cart.region_id!)
    }

    return NextResponse.json(
      { cart },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    )
  } catch (err) {
    console.error('[/api/cart] Error retrieving cart:', err)
    return NextResponse.json({ cart: null }, { status: 500 })
  }
}
