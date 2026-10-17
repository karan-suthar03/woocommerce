// Two guest carts for the last unit of "Test", both paid via the mock,
// then completed at the same instant. Prints what each completion returned.
import fs from 'node:fs'

const A = 'http://localhost:9000'
const PK = fs.readFileSync('D:/personal/woocommerce/solace-medusa-starter/.env.local', 'utf8')
  .match(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=(.*)$/m)[1].trim()
const VARIANT = 'variant_01M36C31YP9M2B91SCHZ61PBAY'
const REGION = 'reg_01KZZECCP26TYCTD6ERWJR08M7'
const addr = {
  first_name: 'Oversell', last_name: 'Test', address_1: 'Test Address 1', city: 'Akkalkot',
  postal_code: '413216', province: 'Maharashtra', country_code: 'in', phone: '8291734650',
}

async function call(method, path, body) {
  const r = await fetch(A + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-publishable-api-key': PK },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok && !path.endsWith('/complete')) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j).slice(0, 200)}`)
  return { status: r.status, body: j }
}

async function readyCart(n) {
  const { body: { cart } } = await call('POST', '/store/carts', { region_id: REGION, email: `oversell${n}@example.com` })
  await call('POST', `/store/carts/${cart.id}/line-items`, { variant_id: VARIANT, quantity: 1 })
  await call('POST', `/store/carts/${cart.id}`, { shipping_address: addr, billing_address: addr })
  const { body: so } = await call('GET', `/store/shipping-options?cart_id=${cart.id}`)
  await call('POST', `/store/carts/${cart.id}/shipping-methods`, { option_id: so.shipping_options[0].id })
  const { body: pc } = await call('POST', '/store/payment-collections', { cart_id: cart.id })
  const { body: ps } = await call('POST', `/store/payment-collections/${pc.payment_collection.id}/payment-sessions`, { provider_id: 'pp_razorpay_razorpay' })
  const rzpOrder = ps.payment_collection.payment_sessions[0].data.razorpayOrder.id
  const paid = await fetch('http://localhost:8790/mock/pay', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: rzpOrder, webhook_delay_ms: null }),
  })
  if (!paid.ok) throw new Error('mock pay failed')
  console.log(`cart ${n}: ${cart.id} ready (paid ${rzpOrder})`)
  return cart.id
}

const carts = await Promise.all([readyCart(1), readyCart(2)])
console.log('completing both at once…')
const results = await Promise.all(carts.map(id => call('POST', `/store/carts/${id}/complete`)))
results.forEach((r, i) => {
  const b = r.body
  console.log(`cart ${i + 1}: HTTP ${r.status} type=${b.type ?? '-'} ${b.order ? 'ORDER #' + b.order.display_id + ' ' + b.order.id : ''} ${b.error?.message ?? b.message ?? ''}`)
})
fs.writeFileSync(new URL('./oversell-result.json', import.meta.url), JSON.stringify({ carts, results }, null, 2))
