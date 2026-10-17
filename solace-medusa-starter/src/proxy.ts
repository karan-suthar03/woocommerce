import { NextRequest, NextResponse } from 'next/server'
import type { HttpTypes } from '@medusajs/types'

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const DEFAULT_REGION = (process.env.NEXT_PUBLIC_DEFAULT_REGION || 'in').toLowerCase()

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
}

async function getRegionMap() {
  const { regionMap, regionMapUpdated } = regionMapCache

  if (
    !regionMap.keys().next().value ||
    regionMapUpdated < Date.now() - 3600 * 1000
  ) {
    try {
      if (!BACKEND_URL || !PUBLISHABLE_API_KEY) {
        console.error(
          '[Proxy] Missing NEXT_PUBLIC_MEDUSA_BACKEND_URL or NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY'
        )
        return regionMapCache.regionMap
      }

      console.log('[Proxy] Fetching regions from backend...')

      // Use raw fetch with timeout instead of SDK to avoid middleware blocking
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(`${BACKEND_URL}/store/regions`, {
        headers: {
          'x-publishable-api-key': PUBLISHABLE_API_KEY,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Region fetch failed: ${response.status}`)
      }

      const data = await response.json()
      const regions = data.regions

      console.log(`[Proxy] Fetched ${regions?.length || 0} regions`)

      if (!regions?.length) {
        console.error('[Proxy] No regions configured in Medusa backend')
        return regionMapCache.regionMap
      }

      regions.forEach((region: HttpTypes.StoreRegion) => {
        region.countries?.forEach((c) => {
          regionMapCache.regionMap.set(c.iso_2 ?? '', region)
        })
      })

      regionMapCache.regionMapUpdated = Date.now()
      console.log('[Proxy] Region map cached successfully')
    } catch (error: any) {
      console.error('[Proxy] Error fetching regions:', error.message || error)
      // Return empty map, let the app use default region
      return regionMapCache.regionMap
    }
  }

  return regionMapCache.regionMap
}

/**
 * Fetches regions from Medusa and sets the region cookie.
 * @param request
 * @param response
 */
function getCountryCode(
  request: NextRequest,
  regionMap: Map<string, HttpTypes.StoreRegion | number>
) {
  try {
    let countryCode

    const vercelCountryCode = request.headers
      .get('x-vercel-ip-country')
      ?.toLowerCase()

    const urlCountryCode = request.nextUrl.pathname.split('/')[1]?.toLowerCase()

    if (urlCountryCode && regionMap.has(urlCountryCode)) {
      countryCode = urlCountryCode
    } else if (vercelCountryCode && regionMap.has(vercelCountryCode)) {
      countryCode = vercelCountryCode
    } else if (regionMap.has(DEFAULT_REGION)) {
      countryCode = DEFAULT_REGION
    } else if (regionMap.keys().next().value) {
      countryCode = regionMap.keys().next().value
    } else {
      countryCode = DEFAULT_REGION
    }

    return countryCode
  } catch (error) {
    return DEFAULT_REGION
  }
}

/**
 * Proxy to handle region selection, onboarding status, and clean URLs.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/app') ||
    pathname.startsWith('/admin')
  ) {
    return NextResponse.next()
  }

  const searchParams = request.nextUrl.searchParams
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const cartId = searchParams.get('cart_id')
  const checkoutStep = searchParams.get('step')
  const onboardingCookie = request.cookies.get('_medusa_onboarding')
  const cartIdCookie = request.cookies.get('_medusa_cart_id')

  const regionMap = await getRegionMap()
  const countryCode =
    (regionMap && (await getCountryCode(request, regionMap))) || DEFAULT_REGION
  const defaultRegion = DEFAULT_REGION.toLowerCase()

  const firstSegment = request.nextUrl.pathname.split('/')[1]?.toLowerCase()
  const urlHasCountryCode = firstSegment ? regionMap.has(firstSegment) : false

  // 1. If URL explicitly contains default country code (e.g. /in/shop), 301 redirect to clean URL (/shop)
  // NEVER redirect POST or Server Action requests with 301/302/307
  const isPostOrAction =
    request.method === 'POST' || Boolean(request.headers.get('next-action'))

  if (!isPostOrAction && urlHasCountryCode && firstSegment === defaultRegion) {
    let cleanPath = request.nextUrl.pathname.slice(defaultRegion.length + 1)
    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`
    }
    const redirectUrl = new URL(
      `${cleanPath === '' ? '/' : cleanPath}${request.nextUrl.search}`,
      request.nextUrl.origin
    )
    return NextResponse.redirect(redirectUrl, 301)
  }

  // 1.1 Reset Password Guard — redirect /account/reset-password to /[countryCode]/reset-password
  if (request.nextUrl.pathname.includes('/account/reset-password')) {
    const targetPath = request.nextUrl.pathname.replace('/account/reset-password', '/reset-password')
    const finalPath = countryCode && !targetPath.startsWith(`/${countryCode}`)
      ? `/${countryCode}${targetPath}`
      : targetPath
    const targetUrl = new URL(finalPath + request.nextUrl.search, request.nextUrl.origin)
    return NextResponse.redirect(targetUrl, 307)
  }

  // 2. Authenticated Checkout Guard
  const checkoutPathRegex = /^\/([a-z]{2}\/)?checkout(\/|$|\?)/
  const isCheckoutRoute =
    checkoutPathRegex.test(request.nextUrl.pathname) ||
    request.nextUrl.pathname.endsWith('/checkout')

  if (isCheckoutRoute) {
    const authToken = request.cookies.get('_medusa_jwt')?.value

    if (!authToken) {
      const checkoutPath = request.nextUrl.pathname + request.nextUrl.search
      const loginPath =
        countryCode === defaultRegion ? '/account' : `/${countryCode}/account`
      const loginUrl = new URL(loginPath, request.nextUrl.origin)
      loginUrl.searchParams.set('redirectTo', checkoutPath)

      return NextResponse.redirect(loginUrl, 307)
    }
  }

  // 2.1 /account?redirectTo=… is resolved by the account layout, which checks
  // the session with the backend. Redirecting here on cookie presence alone
  // loops forever with an expired JWT: checkout gets a 401 and sends the
  // customer to /account, and a cookie-only check here sends them straight back.

  // 3. Handle non-default country code in URL (e.g. /us/shop)
  if (urlHasCountryCode && firstSegment !== defaultRegion) {
    if (
      (!isOnboarding || onboardingCookie) &&
      (!cartId || cartIdCookie)
    ) {
      return NextResponse.next()
    }
  }

  // 4. Internal Rewrite for clean URLs (e.g. /shop -> /in/shop behind the scenes)
  let response = NextResponse.next()

  if (!urlHasCountryCode) {
    const internalUrl = new URL(
      `/${countryCode}${request.nextUrl.pathname}${request.nextUrl.search}`,
      request.nextUrl.origin
    )
    response = NextResponse.rewrite(internalUrl)
  }

  if (cartId && !checkoutStep) {
    response.cookies.set('_medusa_cart_id', cartId, { maxAge: 60 * 60 * 24 })
  }

  if (isOnboarding) {
    response.cookies.set('_medusa_onboarding', 'true', {
      maxAge: 60 * 60 * 24,
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!api|app|admin|_next/static|_next/image|favicon.ico|sitemap\\.xml|robots\\.txt|logo|favicon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)'],
}
