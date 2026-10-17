import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import nodemailer from "nodemailer"
import { STORE_SETTINGS_MODULE } from "../modules/store-settings"
import StoreSettingsModuleService from "../modules/store-settings/service"

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a price amount to a locale string (e.g. ₹799.00). */
function formatPrice(
  amount: number | null | undefined,
  currencyCode: string
): string {
  if (amount == null) return "—"
  const numericAmount = Number(amount)
  if (isNaN(numericAmount)) return "—"

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currencyCode || "INR").toUpperCase(),
    minimumFractionDigits: 2,
  }).format(numericAmount)
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatAddress(addr: Record<string, any> | null | undefined): string {
  if (!addr) return "—"
  const parts = [
    [addr.first_name, addr.last_name].filter(Boolean).join(" "),
    addr.company,
    addr.address_1,
    addr.address_2,
    [addr.city, addr.province, addr.postal_code].filter(Boolean).join(", "),
    addr.country_code?.toUpperCase(),
    addr.phone ? `📞 ${addr.phone}` : "",
  ].filter(Boolean)
  return parts.join("<br>")
}

function humanizePaymentStatus(status: string | null | undefined): string {
  if (!status) return "—"
  const map: Record<string, string> = {
    captured: "Paid",
    authorized: "Authorized",
    pending: "Pending",
    requires_more: "Requires Action",
    canceled: "Cancelled",
    partially_captured: "Partially Paid",
    refunded: "Refunded",
    partially_refunded: "Partially Refunded",
    not_paid: "Not Paid",
  }
  return map[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function getItemQuantity(item: any): number {
  const qty = Number(
    item.quantity ??
    item.detail?.quantity ??
    item.item?.quantity ??
    1
  )
  return isNaN(qty) || qty <= 0 ? 1 : qty
}

function getItemUnitPrice(item: any): number {
  const price = Number(
    item.unit_price ??
    item.unit_amount ??
    item.item?.unit_price ??
    0
  )
  return isNaN(price) ? 0 : price
}

function getItemLineTotal(item: any): number {
  const qty = getItemQuantity(item)
  const unitPrice = getItemUnitPrice(item)
  const subtotal = Number(item.subtotal ?? item.total ?? 0)
  if (!isNaN(subtotal) && subtotal > 0) {
    return subtotal
  }
  return unitPrice * qty
}

// ─── Email templates ──────────────────────────────────────────────────────────

function buildItemsTable(
  items: any[],
  currencyCode: string
): string {
  const rows = items
    .map((item) => {
      const thumbnail = item.thumbnail
        ? `<img src="${item.thumbnail}" alt="${item.title}" width="60" style="border-radius:4px;vertical-align:middle;">`
        : ""
      const variantTitle = item.variant_title ?? item.variant?.title ?? ""
      const unitPrice = getItemUnitPrice(item)
      const quantity = getItemQuantity(item)
      const lineTotal = getItemLineTotal(item)

      return `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:12px 8px;vertical-align:middle;">${thumbnail}</td>
          <td style="padding:12px 8px;vertical-align:middle;">
            <strong>${item.product_title ?? item.title ?? "Product"}</strong>
            ${variantTitle ? `<br><span style="color:#666;font-size:13px;">${variantTitle}</span>` : ""}
          </td>
          <td style="padding:12px 8px;text-align:center;vertical-align:middle;">${quantity}</td>
          <td style="padding:12px 8px;text-align:right;vertical-align:middle;">${formatPrice(unitPrice, currencyCode)}</td>
          <td style="padding:12px 8px;text-align:right;vertical-align:middle;">${formatPrice(lineTotal, currencyCode)}</td>
        </tr>`
    })
    .join("")

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;">
      <thead>
        <tr style="background:#f9f9f9;">
          <th style="padding:10px 8px;text-align:left;font-size:13px;color:#555;" colspan="2">Product</th>
          <th style="padding:10px 8px;text-align:center;font-size:13px;color:#555;">Qty</th>
          <th style="padding:10px 8px;text-align:right;font-size:13px;color:#555;">Unit Price</th>
          <th style="padding:10px 8px;text-align:right;font-size:13px;color:#555;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function buildTotalsBlock(order: any): string {
  const currency = order.currency_code ?? "inr"

  const items = order.items ?? []
  const subtotal = items.reduce((acc: number, item: any) => acc + getItemLineTotal(item), 0)

  const shippingMethodAmount = Number(
    order.shipping_methods?.[0]?.amount ??
    order.shipping_methods?.[0]?.price ??
    order.shipping_total ??
    0
  )
  const shipping = isNaN(shippingMethodAmount) ? 0 : shippingMethodAmount

  const tax = Number(order.tax_total ?? 0)
  const discount = Number(order.discount_total ?? 0)
  const total = subtotal + shipping + (isNaN(tax) ? 0 : tax) - (isNaN(discount) ? 0 : discount)

  const rows = [
    ["Subtotal", subtotal],
    ["Shipping", shipping],
    ...(tax > 0 ? [["Tax", tax]] : []),
    ...(discount > 0 ? [["Discount", -discount]] : []),
  ]
  return rows
    .map(
      ([label, val]) => `
      <tr>
        <td style="padding:6px 0;color:#555;">${label}</td>
        <td style="padding:6px 0;text-align:right;">${formatPrice(val as number, currency)}</td>
      </tr>`
    )
    .concat([
      `<tr style="border-top:2px solid #333;font-weight:bold;">
        <td style="padding:10px 0;">Total</td>
        <td style="padding:10px 0;text-align:right;">${formatPrice(total, currency)}</td>
      </tr>`,
    ])
    .join("")
}

// ── Customer confirmation email ───────────────────────────────────────────────
function customerEmailHtml(order: any, logoUrl: string = "", brandName: string = "Swami Om Enterprises"): { subject: string; html: string; text: string } {
  const currency = order.currency_code ?? "inr"
  const payStatus = humanizePaymentStatus(
    order.payment_collections?.[0]?.status ?? order.payment_status
  )

  const items = order.items ?? []
  const subtotal = items.reduce((acc: number, item: any) => acc + getItemLineTotal(item), 0)

  const shippingMethodAmount = Number(
    order.shipping_methods?.[0]?.amount ??
    order.shipping_methods?.[0]?.price ??
    order.shipping_total ??
    0
  )
  const shipping = isNaN(shippingMethodAmount) ? 0 : shippingMethodAmount
  const tax = Number(order.tax_total ?? 0)
  const discount = Number(order.discount_total ?? 0)
  const total = subtotal + shipping + (isNaN(tax) ? 0 : tax) - (isNaN(discount) ? 0 : discount)

  const subject = `Order Confirmed — #${order.display_id ?? order.id.slice(-8).toUpperCase()} | ${brandName}`

  const headerContent = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName}" style="max-height:56px;max-width:220px;height:auto;width:auto;display:inline-block;vertical-align:middle;" />`
    : `<h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px;">${brandName}</h1>`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1a1a1a;padding:24px 32px;text-align:center;">
          ${headerContent}
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:32px 32px 16px;text-align:center;">
          <div style="font-size:48px;">✅</div>
          <h2 style="margin:12px 0 4px;font-size:20px;color:#1a1a1a;">Order Confirmed!</h2>
          <p style="margin:0;color:#666;font-size:14px;">Thank you, ${order.shipping_address?.first_name ?? ""}! Your order has been received and is being processed.</p>
        </td></tr>

        <!-- Order meta -->
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:6px;padding:16px;">
            <tr>
              <td style="font-size:13px;color:#555;padding:4px 0;">Order Number</td>
              <td style="font-size:13px;font-weight:bold;text-align:right;">#${order.display_id ?? order.id.slice(-8).toUpperCase()}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#555;padding:4px 0;">Order Date</td>
              <td style="font-size:13px;text-align:right;">${formatDate(order.created_at)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#555;padding:4px 0;">Payment Status</td>
              <td style="font-size:13px;text-align:right;">
                <span style="background:#d4edda;color:#155724;padding:2px 10px;border-radius:12px;font-weight:bold;">${payStatus}</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Items -->
        <tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 4px;font-size:15px;color:#1a1a1a;">Items Ordered</h3>
          ${buildItemsTable(order.items ?? [], currency)}
        </td></tr>

        <!-- Totals -->
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:6px;padding:16px;">
            ${buildTotalsBlock(order)}
          </table>
        </td></tr>

        <!-- Shipping address -->
        <tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 8px;font-size:15px;color:#1a1a1a;">Shipping Address</h3>
          <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">${formatAddress(order.shipping_address)}</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9f9f9;padding:24px 32px;text-align:center;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#999;">
            If you have any questions, reply to this email or contact us at <a href="mailto:${process.env.SMTP_FROM_EMAIL}" style="color:#555;">${process.env.SMTP_FROM_EMAIL}</a>.
          </p>
          <p style="margin:8px 0 0;font-size:12px;color:#bbb;">© ${new Date().getFullYear()} Swami Om Enterprises. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `
ORDER CONFIRMED — #${order.display_id ?? order.id}
Swami Om Enterprises

Thank you, ${order.shipping_address?.first_name ?? ""}!

Order Date: ${formatDate(order.created_at)}
Payment Status: ${payStatus}

ITEMS:
${(order.items ?? []).map((i: any) => `  - ${i.product_title ?? i.title} x${getItemQuantity(i)} — ${formatPrice(getItemUnitPrice(i), currency)}`).join("\n")}

Subtotal: ${formatPrice(subtotal, currency)}
Shipping: ${formatPrice(shipping, currency)}
Tax:      ${formatPrice(tax, currency)}
TOTAL:    ${formatPrice(total, currency)}

Shipping to:
${order.shipping_address ? [
  `${order.shipping_address.first_name ?? ""} ${order.shipping_address.last_name ?? ""}`,
  order.shipping_address.address_1,
  `${order.shipping_address.city}, ${order.shipping_address.postal_code}`,
  order.shipping_address.country_code?.toUpperCase(),
].filter(Boolean).join(", ") : "—"}

Questions? Contact us at ${process.env.SMTP_FROM_EMAIL}
  `.trim()

  return { subject, html, text }
}

// ── Admin notification email ──────────────────────────────────────────────────
function adminEmailHtml(order: any, logoUrl: string = "", brandName: string = "Swami Om Enterprises"): { subject: string; html: string; text: string } {
  const currency = order.currency_code ?? "inr"
  const payStatus = humanizePaymentStatus(
    order.payment_collections?.[0]?.status ?? order.payment_status
  )

  const items = order.items ?? []
  const subtotal = items.reduce((acc: number, item: any) => acc + getItemLineTotal(item), 0)

  const shippingMethodAmount = Number(
    order.shipping_methods?.[0]?.amount ??
    order.shipping_methods?.[0]?.price ??
    order.shipping_total ??
    0
  )
  const shipping = isNaN(shippingMethodAmount) ? 0 : shippingMethodAmount
  const tax = Number(order.tax_total ?? 0)
  const discount = Number(order.discount_total ?? 0)
  const total = subtotal + shipping + (isNaN(tax) ? 0 : tax) - (isNaN(discount) ? 0 : discount)

  const subject = `🛒 New Order #${order.display_id ?? order.id.slice(-8).toUpperCase()} — ${formatPrice(total, currency)}`

  const headerContent = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName}" style="max-height:45px;max-width:180px;height:auto;width:auto;display:inline-block;vertical-align:middle;" />`
    : `<h2 style="color:#fff;margin:0;font-size:18px;">🛒 New Order Received</h2><p style="color:#aaa;margin:4px 0 0;font-size:13px;">${brandName} Admin Alert</p>`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <tr><td style="background:#1a1a1a;padding:20px 32px;">
          ${headerContent}
        </td></tr>

        <!-- Order + Customer Summary -->
        <tr><td style="padding:24px 32px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;padding:16px;">
            <tr>
              <td style="font-size:13px;color:#555;padding:3px 0;">Order #</td>
              <td style="font-size:13px;font-weight:bold;text-align:right;">#${order.display_id ?? order.id.slice(-8).toUpperCase()}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#555;padding:3px 0;">Date</td>
              <td style="font-size:13px;text-align:right;">${formatDate(order.created_at)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#555;padding:3px 0;">Customer</td>
              <td style="font-size:13px;text-align:right;">${order.shipping_address?.first_name ?? ""} ${order.shipping_address?.last_name ?? ""}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#555;padding:3px 0;">Customer Email</td>
              <td style="font-size:13px;text-align:right;">${order.email ?? "—"}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#555;padding:3px 0;">Customer Phone</td>
              <td style="font-size:13px;text-align:right;">${order.shipping_address?.phone ?? "—"}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#555;padding:3px 0;">Payment Status</td>
              <td style="font-size:13px;font-weight:bold;text-align:right;color:#155724;">${payStatus}</td>
            </tr>
            <tr>
              <td style="font-size:15px;font-weight:bold;padding:8px 0 0;border-top:1px solid #ccc;">Order Total</td>
              <td style="font-size:15px;font-weight:bold;text-align:right;border-top:1px solid #ccc;">${formatPrice(total, currency)}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Items -->
        <tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 4px;font-size:15px;">Items</h3>
          ${buildItemsTable(order.items ?? [], currency)}
        </td></tr>

        <!-- Totals -->
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:6px;padding:16px;">
            ${buildTotalsBlock(order)}
          </table>
        </td></tr>

        <!-- Shipping Address -->
        <tr><td style="padding:0 32px 16px;">
          <h3 style="margin:0 0 8px;font-size:15px;">Shipping Address</h3>
          <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">${formatAddress(order.shipping_address)}</p>
        </td></tr>

        <!-- Billing Address -->
        <tr><td style="padding:0 32px 24px;">
          <h3 style="margin:0 0 8px;font-size:15px;">Billing Address</h3>
          <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">${formatAddress(order.billing_address)}</p>
        </td></tr>

        <tr><td style="background:#f9f9f9;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#999;">This is an automated admin notification from Swami Om Enterprises.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = `
NEW ORDER — #${order.display_id ?? order.id}
Customer: ${order.shipping_address?.first_name ?? ""} ${order.shipping_address?.last_name ?? ""} (${order.email ?? "—"})
Phone: ${order.shipping_address?.phone ?? "—"}
Date: ${formatDate(order.created_at)}
Payment: ${payStatus}

ITEMS:
${(order.items ?? []).map((i: any) => `  - ${i.product_title ?? i.title} x${i.quantity} @ ${formatPrice(i.unit_price, currency)}`).join("\n")}

Subtotal: ${formatPrice(order.subtotal, currency)}
Shipping: ${formatPrice(order.shipping_total, currency)}
Tax:      ${formatPrice(order.tax_total, currency)}
TOTAL:    ${formatPrice(order.total, currency)}

Ship to: ${order.shipping_address ? `${order.shipping_address.first_name} ${order.shipping_address.last_name}, ${order.shipping_address.address_1}, ${order.shipping_address.city}, ${order.shipping_address.postal_code}, ${order.shipping_address.country_code?.toUpperCase()}` : "—"}
  `.trim()

  return { subject, html, text }
}

// ─── Mailer helper ────────────────────────────────────────────────────────────

async function sendEmail({
  to,
  subject,
  html,
  text,
  logger,
}: {
  to: string
  subject: string
  html: string
  text: string
  logger: any
}) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })

  const result = await transporter.sendMail({
    from: `${process.env.SMTP_FROM_NAME ?? "Swami Om Enterprises"} <${process.env.SMTP_FROM_EMAIL}>`,
    to,
    subject,
    html,
    text,
  })

  logger.info(`📧 Email sent to ${to} — messageId: ${result.messageId}`)
  return result
}

// ─── Subscriber ───────────────────────────────────────────────────────────────

/**
 * Fires when a cart is successfully converted to an order.
 *
 * Responsibilities:
 *  1. Fetch full order data from Medusa (items, addresses, totals, payment status).
 *  2. Send a rich customer order-confirmation email.
 *  3. Send an admin new-order notification email to SMTP_FROM_EMAIL (or ADMIN_EMAIL if set).
 */
export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  logger.info(`[order-placed] Processing order ${orderId}`)

  try {
    // ── 1. Fetch full order via query graph ────────────────────────────────
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: [
        "id",
        "display_id",
        "status",
        "email",
        "currency_code",
        "subtotal",
        "shipping_total",
        "tax_total",
        "discount_total",
        "total",
        "created_at",
        // Addresses
        "shipping_address.first_name",
        "shipping_address.last_name",
        "shipping_address.address_1",
        "shipping_address.address_2",
        "shipping_address.company",
        "shipping_address.city",
        "shipping_address.province",
        "shipping_address.postal_code",
        "shipping_address.country_code",
        "shipping_address.phone",
        "billing_address.first_name",
        "billing_address.last_name",
        "billing_address.address_1",
        "billing_address.address_2",
        "billing_address.company",
        "billing_address.city",
        "billing_address.province",
        "billing_address.postal_code",
        "billing_address.country_code",
        "billing_address.phone",
        // Line items (specific scalar fields for email template)
        "items.id",
        "items.title",
        "items.product_title",
        "items.variant_title",
        "items.quantity",
        "items.unit_price",
        "items.thumbnail",
        "items.subtotal",
        "items.total",
        // Shipping methods
        "shipping_methods.name",
        "shipping_methods.amount",
        // Payment
        "payment_collections.status",
        "payment_status",
      ],
    })

    const order = orders?.[0]
    if (!order) {
      logger.warn(`[order-placed] Order ${orderId} not found — skipping emails`)
      return
    }

    const customerEmail = order.email
    const adminEmail = process.env.ADMIN_EMAIL ?? process.env.SMTP_FROM_EMAIL

    if (!customerEmail) {
      logger.warn(`[order-placed] Order ${orderId} has no customer email — skipping customer email`)
    }

    // ── 2. Fetch Store Branding (Logo & Name) ───────────────────────────
    let logoUrl = ""
    let brandName = "Swami Om Enterprises"
    try {
      let storeSettingsService: StoreSettingsModuleService
      try {
        storeSettingsService = container.resolve(STORE_SETTINGS_MODULE)
      } catch {
        storeSettingsService = new StoreSettingsModuleService()
      }
      logoUrl = await storeSettingsService.getSetting("store.logo_url")
      const customBrand = await storeSettingsService.getSetting("store.brand_name")
      if (customBrand && customBrand.trim()) {
        brandName = customBrand.trim()
      }
    } catch (e) {
      logger.warn(`[order-placed] Could not load store settings branding: ${e}`)
    }

    // ── 3. Send customer confirmation email ────────────────────────────────
    if (customerEmail) {
      const { subject, html, text } = customerEmailHtml(order, logoUrl, brandName)
      await sendEmail({ to: customerEmail, subject, html, text, logger })
      logger.info(`[order-placed] Customer confirmation sent to ${customerEmail}`)
    }

    // ── 4. Send admin notification email ───────────────────────────────────
    if (adminEmail) {
      const { subject, html, text } = adminEmailHtml(order, logoUrl, brandName)
      await sendEmail({ to: adminEmail, subject, html, text, logger })
      logger.info(`[order-placed] Admin notification sent to ${adminEmail}`)
    }
  } catch (error: any) {
    // Swallow so a mail failure never blocks order confirmation.
    logger.error(`[order-placed] Failed to send order emails: ${error.message}`, error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
