import { cache } from 'react'

import { catalogFetch } from './catalog-fetch'
import medusaError from '@lib/util/medusa-error'
import { HttpTypes } from '@medusajs/types'

export const listRegions = cache(async function () {
  return catalogFetch<any>("/store/regions", {}, "regions")
    .then(({ regions }) => {
      return regions
    })
    .catch((err) => {
      return medusaError(err)
    })
})

export const retrieveRegion = cache(async function (id: string) {
  return catalogFetch<any>(`/store/regions/${id}`, {}, "regions")
    .then(({ region }) => region)
    .catch(medusaError)
})

const regionMap = new Map<string, HttpTypes.StoreRegion>()

export const getRegion = cache(async function (countryCode: string) {
  try {
    const normalizedCountryCode = countryCode?.toLowerCase() || 'us'

    if (regionMap.has(normalizedCountryCode)) {
      return regionMap.get(normalizedCountryCode)
    }

    const regions = await listRegions()

    if (!regions || !regions.length) {
      return null
    }

    regions.forEach((region) => {
      region.countries?.forEach((c) => {
        const iso = c?.iso_2?.toLowerCase() ?? ''
        if (iso) {
          regionMap.set(iso, region)
        }
      })
    })

    const res =
      regionMap.get(normalizedCountryCode) ??
      regionMap.get('us') ??
      regionMap.get('in') ??
      regionMap.values().next().value ??
      regions[0] ??
      null

    return res
  } catch (e: any) {
    console.error('[regions.ts] getRegion ERROR:', e.message, e.stack)
    return null
  }
})
