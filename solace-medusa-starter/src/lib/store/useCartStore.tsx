import { HttpTypes } from '@medusajs/types'
import { create } from 'zustand'

interface CartStore {
  // Drawer visibility
  isOpenCartDropdown: boolean
  openCartDropdown: () => void
  closeCartDropdown: () => void

  // Live cart state (client-side)
  cart: HttpTypes.StoreCart | null
  isCartLoading: boolean
  setCart: (cart: HttpTypes.StoreCart | null) => void
  refreshCart: () => Promise<void>

  // Optimistic updates
  updateItemQuantityOptimistic: (itemId: string, newQuantity: number) => void
  deleteItemOptimistic: (itemId: string) => void
}

export const useCartStore = create<CartStore>((set, get) => ({
  // Drawer
  isOpenCartDropdown: false,
  openCartDropdown: () => set({ isOpenCartDropdown: true }),
  closeCartDropdown: () => set({ isOpenCartDropdown: false }),

  // Cart state
  cart: null,
  isCartLoading: false,
  setCart: (cart) => set({ cart }),

  refreshCart: async () => {
    set({ isCartLoading: true })
    try {
      const res = await fetch('/api/cart', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      })
      if (res.ok) {
        const data = await res.json()
        set({ cart: data.cart ?? null })
      }
    } catch (err) {
      console.error('[useCartStore] Failed to refresh cart:', err)
    } finally {
      set({ isCartLoading: false })
    }
  },

  updateItemQuantityOptimistic: (itemId: string, newQuantity: number) => {
    const currentCart = get().cart
    if (!currentCart || !currentCart.items) return

    const updatedItems = currentCart.items.map((item) => {
      if (item.id === itemId) {
        return { ...item, quantity: newQuantity }
      }
      return item
    })

    // Recalculate subtotal
    const newSubtotal = updatedItems.reduce((sum, item) => {
      const price = item.unit_price ?? 0
      return sum + price * item.quantity
    }, 0)

    set({
      cart: {
        ...currentCart,
        items: updatedItems,
        subtotal: newSubtotal,
      },
    })
  },

  deleteItemOptimistic: (itemId: string) => {
    const currentCart = get().cart
    if (!currentCart || !currentCart.items) return

    const updatedItems = currentCart.items.filter((item) => item.id !== itemId)

    // Recalculate subtotal
    const newSubtotal = updatedItems.reduce((sum, item) => {
      const price = item.unit_price ?? 0
      return sum + price * item.quantity
    }, 0)

    set({
      cart: {
        ...currentCart,
        items: updatedItems,
        subtotal: newSubtotal,
      },
    })
  },
}))
