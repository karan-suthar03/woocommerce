import { cache } from 'react'

import { catalogFetch } from './catalog-fetch'
import { HttpTypes } from '@medusajs/types'

import { getProductsList } from './products'

export const retrieveCollection = cache(async function (id: string) {
  return catalogFetch<any>(`/store/collections/${id}`, {}, "collections")
    .then(({ collection }) => collection)
})

export const getCollectionsList = cache(async function (
  limit: number = 100
): Promise<{ collections: HttpTypes.StoreCollection[]; count: number }> {
  return catalogFetch<any>("/store/collections", { limit, offset: 0 }, "collections")
    .then(({ collections }) => ({ collections, count: collections.length }))
})

export const getCollectionByHandle = cache(async function (
  handle: string
): Promise<HttpTypes.StoreCollection> {
  return catalogFetch<any>("/store/collections", { handle }, "collections")
    .then(({ collections }) => collections[0])
})

export const getAllCollectionsWithProducts = cache(
  async (countryCode: string): Promise<HttpTypes.StoreCollection[] | null> => {
    const { collections } = await getCollectionsList(100)

    if (!collections) {
      return null
    }

    const collectionIds = collections
      .map((collection) => collection.id)
      .filter(Boolean)

    const { response } = await getProductsList({
      queryParams: { collection_id: collectionIds } as any,
      countryCode,
    })

    response.products.forEach((product) => {
      const collection = collections.find(
        (collection) => collection.id === product.collection_id
      )

      if (collection) {
        if (!collection.products) {
          collection.products = []
        }

        collection.products.push(product as any)
      }
    })

    return collections as unknown as HttpTypes.StoreCollection[]
  }
)

export const getCollectionsWithProducts = cache(
  async (countryCode: string): Promise<HttpTypes.StoreCollection[] | null> => {
    const { collections } = await getCollectionsList(3)

    if (!collections) {
      return null
    }

    const collectionIds = collections
      .map((collection) => collection.id)
      .filter(Boolean)

    const { response } = await getProductsList({
      // TO DO: type this correctly
      queryParams: { collection_id: collectionIds } as any,
      countryCode,
    })

    response.products.forEach((product) => {
      const collection = collections.find(
        (collection) => collection.id === product.collection_id
      )

      if (collection) {
        if (!collection.products) {
          collection.products = []
        }

        collection.products.push(product as any)
      }
    })

    return collections as unknown as HttpTypes.StoreCollection[]
  }
)
