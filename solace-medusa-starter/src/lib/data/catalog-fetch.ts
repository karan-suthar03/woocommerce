import { sdk } from '@lib/config'

/**
 * Cached read of public catalogue data (products, categories, collections,
 * regions), shared between visitors.
 *
 * The SDK's `sdk.store.*.list(query, headers)` only accepts headers, so the
 * `{ next: { tags } }` the starter passed there was sent as a junk HTTP header
 * and nothing was ever cached — every page view re-fetched everything.
 * `sdk.client.fetch` forwards `cache`/`next` to fetch(). Entries refresh when
 * the backend revalidates the tag (admin edits) and at most every 60 s, so
 * stock shown on pages is at most a minute old; payment and order creation
 * always re-check live stock.
 */
export function catalogFetch<T = any>(
  path: string,
  query: Record<string, unknown>,
  tag: 'products' | 'categories' | 'collections' | 'regions'
): Promise<T> {
  return sdk.client.fetch<T>(path, {
    query,
    cache: 'force-cache',
    next: { tags: [tag], revalidate: 60 },
  } as any)
}
