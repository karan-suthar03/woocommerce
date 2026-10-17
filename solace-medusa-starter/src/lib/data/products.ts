import { unstable_noStore as noStore } from 'next/cache'

import { catalogFetch } from './catalog-fetch'
import { HttpTypes } from '@medusajs/types'
import { ProductFilters } from 'types/global'

import { getRegion } from './regions'
import { listCategories } from './categories'

const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || 'in'

export const getProductsById = async function ({
  ids,
  regionId,
}: {
  ids: string[]
  regionId: string
}) {
  return catalogFetch<any>("/store/products", 
      {
        id: ids,
        region_id: regionId,
        fields:
          '*variants.calculated_price,+variants.inventory_quantity,+variants.thumbnail,*variants,*variants.prices,*categories,+metadata',
      },
      "products"
    )
    .then(({ products }) => products)
}

export const getProductByHandle = async function (
  handle: string,
  regionId: string
) {
  const result = await catalogFetch<any>("/store/products", 
      {
        handle,
        region_id: regionId,
        fields:
          '*variants.calculated_price,+variants.inventory_quantity,+variants.thumbnail,*variants,*variants.prices,*categories,+metadata',
      },
      "products"
    )

  const product = result.products[0]
  return product
}


export const getProductsList = async function ({
  pageParam = 1,
  queryParams,
  countryCode,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  countryCode: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> {
  const limit = queryParams?.limit || 12
  const offset = Math.max(0, (pageParam - 1) * limit)
  const region = await getRegion(countryCode)

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }
  return catalogFetch<any>("/store/products", 
      {
        limit,
        offset,
        region_id: region.id,
        fields:
          '*variants.calculated_price,+variants.inventory_quantity,*variants,*variants.prices',
        ...queryParams,
      },
      "products"
    )
    .then(({ products }) => {
      const filteredProducts = products.filter((product) => {
        if (!product.variants || product.variants.length === 0) {
          return false
        }
        if (product.variants.length === 1) {
          const variant = product.variants[0]
          if (!variant.manage_inventory) {
            return true
          }
          return (variant.inventory_quantity ?? 0) > 0
        }
        return product.variants.length > 1
      })

      const filteredCount = filteredProducts.length
      const nextPage = filteredCount > offset + limit ? pageParam + 1 : null

      return {
        response: {
          products: filteredProducts,
          count: filteredCount,
        },
        nextPage: nextPage,
        queryParams,
      }
    })
}

export const getProductsListByCollectionId = async function ({
  collectionId,
  countryCode,
  excludeProductId,
  limit = 12,
  offset = 0,
}: {
  collectionId: string
  countryCode: string
  excludeProductId?: string
  limit?: number
  offset?: number
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
}> {
  const region = await getRegion(countryCode)

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  return catalogFetch<any>("/store/products", 
      {
        limit,
        offset,
        collection_id: [collectionId],
        region_id: region.id,
        fields:
          '*variants.calculated_price,+variants.inventory_quantity,*variants,*variants.prices',
      },
      "products"
    )
    .then(({ products, count }) => {
      if (excludeProductId) {
        products = products.filter((product) => product.id !== excludeProductId)
      }

      const nextPage = count > offset + limit ? offset + limit : null

      return {
        response: {
          products,
          count,
        },
        nextPage,
      }
    })
}

export const getStoreFilters = async function (countryCode?: string) {
  const region = await getRegion(countryCode || DEFAULT_REGION)

  if (!region) {
    return {
      collection: [],
      type: [],
      material: [],
      category: [],
    }
  }

  // Fetch products for collection/type/material filters
  const { products } = await catalogFetch<any>("/store/products", 
    {
      limit: 1000,
      region_id: region.id,
      fields: '+collection,+type,+material',
    },
    "products"
  )

  // Fetch real product categories
  const allCategories = await listCategories().catch(() => [])

  const collectionMap = new Map<string, string>()
  const typeMap = new Map<string, string>()
  const materialMap = new Map<string, string>()

  products.forEach((product) => {
    if (product.collection?.id && product.collection.title) {
      collectionMap.set(product.collection.id, product.collection.title)
    }

    if (product.type?.id && product.type.value) {
      typeMap.set(product.type.id, product.type.value)
    }

    if (product.material) {
      materialMap.set(product.material, product.material)
    }
  })

  const sortOptions = (map: Map<string, string>) =>
    Array.from(map, ([id, value]) => ({ id, value })).sort((a, b) =>
      a.value.localeCompare(b.value)
    )

  // Build flat category list (top-level only for filter dropdown)
  const categoryOptions = allCategories
    .filter((cat: any) => !cat.parent_category_id)
    .map((cat: any) => ({ id: cat.id, value: cat.name }))
    .sort((a: any, b: any) => a.value.localeCompare(b.value))

  return {
    collection: sortOptions(collectionMap),
    type: sortOptions(typeMap),
    material: sortOptions(materialMap),
    category: categoryOptions,
  }
}
