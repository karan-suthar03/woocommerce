'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { HttpTypes } from '@medusajs/types'
import { convertToLocale } from '@lib/util/money'
import { getLocalizedPath } from '@lib/util/urls'
import { getPaymentStatusLabel } from '@lib/constants'

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder & { status: string }
}

export default function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const params = useParams()
  const countryCode = (params?.countryCode as string) || 'in'
  const [copied, setCopied] = useState(false)

  const paymentStatus =
    order.payment_status ?? order.payment_collections?.[0]?.status

  const formattedDate = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const currencyCode = order.currency_code ?? 'inr'

  const handlePrintInvoice = () => {
    window.print()
  }

  const handleCopyOrderId = () => {
    const orderIdToCopy = order.display_id ? `#${order.display_id}` : order.id
    navigator.clipboard.writeText(orderIdToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* ── Print Stylesheet for PDF Invoice Generation ────────────────────────── */}
      <style jsx global>{`
        @media print {
          /* Hide non-invoice UI elements when downloading/printing PDF */
          header,
          footer,
          nav,
          .no-print,
          button,
          .print-hidden {
            display: none !important;
          }
          body {
            background-color: #fff !important;
            color: #000 !important;
            font-size: 12pt;
          }
          .print-container {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .invoice-header-print {
            display: block !important;
          }
        }
        .invoice-header-print {
          display: none;
        }
      `}</style>

      <div className="bg-gradient-to-b from-amber-50/40 via-neutral-50 to-neutral-100 min-h-screen py-8 sm:py-12 print-container">
        <div className="container mx-auto px-4 max-w-4xl space-y-6">

          {/* ── Invoice Print Header (Visible only when downloading/printing) ──── */}
          <div className="invoice-header-print mb-8 pb-6 border-b border-gray-300">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-extrabold text-amber-900">॥ श्री स्वामी समर्थ ॥</h1>
                <h2 className="text-xl font-bold text-gray-900">Swami Om Enterprises</h2>
                <p className="text-xs text-gray-600">Shri Swami Samarth Annachhatra Mandal Premises, Akkalkot, Solapur</p>
                <p className="text-xs text-gray-600">Email: support@swamiomenterprises.in | Web: swamiomenterprises.in</p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-bold text-gray-800">TAX INVOICE</h2>
                <p className="text-sm font-semibold text-gray-700">Order #{order.display_id ?? order.id.slice(-8).toUpperCase()}</p>
                <p className="text-xs text-gray-500">Date: {formattedDate}</p>
              </div>
            </div>
          </div>

          {/* ── Top Devotional Banner & Success Hero Card ────────────────────── */}
          <div className="no-print bg-white rounded-3xl p-6 sm:p-8 border border-amber-200/80 shadow-md flex flex-col items-center text-center space-y-4 relative overflow-hidden">
            {/* Top theme accent line */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-400 to-amber-600" />

            {/* Devotional Heading */}
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1 rounded-full bg-amber-100/80 border border-amber-300 text-amber-900 font-bold text-xs sm:text-sm tracking-wide">
              <span>॥ श्री स्वामी समर्थ ॥</span>
            </div>

            {/* Glowing Success Badge */}
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 border-2 border-emerald-300 text-emerald-600 text-3xl font-extrabold shadow-sm animate-pulse">
              ✓
            </div>

            {/* Hero Titles */}
            <div className="space-y-1 max-w-lg">
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                Thank You for Your Order!
              </h1>
              <p className="text-sm sm:text-base text-gray-600">
                Your order has been placed successfully. A confirmation email has been sent to{' '}
                <strong className="text-gray-900 font-semibold">{order.email}</strong>.
              </p>
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                {paymentStatus ? getPaymentStatusLabel(paymentStatus) : 'Paid'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold border border-blue-300">
                Status: {order.status ? order.status.replace(/_/g, ' ').toUpperCase() : 'PROCESSING'}
              </span>
              <button
                onClick={handleCopyOrderId}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-mono font-bold border border-gray-300 transition-all cursor-pointer"
                title="Click to copy order ID"
              >
                <span>Order #{order.display_id ?? order.id.slice(-8).toUpperCase()}</span>
                <span className="text-[10px] text-amber-700">{copied ? '✓ Copied' : '📋'}</span>
              </button>
            </div>

            {/* ── Action Buttons Bar ────────────────────────────────────────── */}
            <div className="w-full pt-4 border-t border-gray-100 flex flex-wrap items-center justify-center gap-3">

              {/* <button
                onClick={handlePrintInvoice}
                className="inline-flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-all shadow-sm hover:shadow-md cursor-pointer"
              >
                <svg className="h-4 w-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download Invoice</span>
              </button> */}

              {/* View in Dashboard Button */}
              <Link
                href={getLocalizedPath('/account', countryCode)}
                className="inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm transition-all shadow-sm hover:shadow-md"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>View Account Dashboard</span>
              </Link>

              {/* Continue Shopping Button */}
              <Link
                href={getLocalizedPath('/shop', countryCode)}
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-amber-50 text-amber-900 font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm border border-amber-300 transition-all"
              >
                <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Continue Shopping</span>
              </Link>
            </div>
          </div>

          {/* ── Order Summary Card ──────────────────────────────────────────── */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">

            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Order Items</h3>
                <p className="text-xs text-gray-500">Placed on {formattedDate}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-gray-500">Order Reference:</span>
                <p className="text-sm font-mono font-bold text-gray-900">#{order.display_id ?? order.id.slice(-8).toUpperCase()}</p>
              </div>
            </div>

            {/* Line Items List */}
            <div className="divide-y divide-gray-100">
              {order.items?.map((item) => {
                const lineTotal = item.subtotal ?? (item.unit_price ?? 0) * (item.quantity ?? 1)
                return (
                  <div key={item.id} className="py-4 flex items-center gap-4">
                    {/* Thumbnail */}
                    <div className="h-16 w-16 flex-shrink-0 rounded-2xl bg-amber-50 border border-amber-100 overflow-hidden flex items-center justify-center">
                      {(item as any).variant?.product?.thumbnail || (item as any).variant?.thumbnail || item.thumbnail ? (
                        <img
                          src={(item as any).variant?.product?.thumbnail || (item as any).variant?.thumbnail || item.thumbnail}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-amber-600 text-xl font-bold">🌸</span>
                      )}
                    </div>

                    {/* Product details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                        {item.product_title ?? item.title}
                      </h4>
                      {item.variant_title && (
                        <p className="text-xs text-gray-500 truncate">Variant: {item.variant_title}</p>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        Quantity: <span className="font-semibold text-gray-900">{item.quantity}</span> ×{' '}
                        {convertToLocale({ amount: item.unit_price, currency_code: currencyCode })}
                      </p>
                    </div>

                    {/* Line total */}
                    <div className="text-right font-bold text-sm sm:text-base text-gray-900">
                      {convertToLocale({ amount: lineTotal, currency_code: currencyCode })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Financial Breakdown Table */}
            <div className="bg-neutral-50 rounded-2xl p-4 sm:p-6 border border-neutral-200/80 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-semibold text-gray-900">
                  {convertToLocale({ amount: order.subtotal ?? 0, currency_code: currencyCode })}
                </span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>Shipping / Delivery</span>
                <span className="font-semibold text-gray-900">
                  {order.shipping_total === 0
                    ? 'FREE'
                    : convertToLocale({ amount: order.shipping_total ?? 0, currency_code: currencyCode })}
                </span>
              </div>

              {order.tax_total != null && order.tax_total > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Estimated Tax</span>
                  <span className="font-semibold text-gray-900">
                    {convertToLocale({ amount: order.tax_total, currency_code: currencyCode })}
                  </span>
                </div>
              )}

              {order.discount_total != null && order.discount_total > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount</span>
                  <span>
                    -{convertToLocale({ amount: order.discount_total, currency_code: currencyCode })}
                  </span>
                </div>
              )}

              <div className="pt-3 border-t border-gray-300 flex justify-between items-center text-base sm:text-lg font-black text-gray-900">
                <span>Total Amount Paid</span>
                <span className="text-amber-900 font-extrabold">
                  {convertToLocale({ amount: order.total ?? 0, currency_code: currencyCode })}
                </span>
              </div>
            </div>
          </div>

          {/* ── Shipping & Billing Addresses Cards ──────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Shipping Address */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Shipping Address</span>
              </div>
              {order.shipping_address ? (
                <div className="text-xs sm:text-sm text-gray-700 leading-relaxed pt-1">
                  <p className="font-bold text-gray-900">
                    {order.shipping_address.first_name} {order.shipping_address.last_name}
                  </p>
                  {order.shipping_address.company && <p>{order.shipping_address.company}</p>}
                  <p>{order.shipping_address.address_1}</p>
                  {order.shipping_address.address_2 && <p>{order.shipping_address.address_2}</p>}
                  <p>
                    {order.shipping_address.city}, {order.shipping_address.province} {order.shipping_address.postal_code}
                  </p>
                  <p className="uppercase font-semibold text-gray-500">{order.shipping_address.country_code}</p>
                  {order.shipping_address.phone && (
                    <p className="mt-1 text-gray-600 font-medium">📞 {order.shipping_address.phone}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No shipping address recorded</p>
              )}
            </div>

            {/* Billing Address */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <span>Payment & Billing</span>
              </div>
              <div className="text-xs sm:text-sm text-gray-700 leading-relaxed pt-1">
                <p className="font-bold text-gray-900">
                  Payment Status: <span className="text-emerald-700">{paymentStatus ? getPaymentStatusLabel(paymentStatus) : 'Paid'}</span>
                </p>
                <p className="text-gray-600 mt-1">
                  Customer Email: <strong className="text-gray-800">{order.email}</strong>
                </p>
                {order.billing_address && (
                  <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
                    <p className="font-semibold text-gray-800">Billing Address:</p>
                    <p>{order.billing_address.address_1}, {order.billing_address.city} {order.billing_address.postal_code}</p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── Footer / Support Note ────────────────────────────────────────── */}
          <div className="no-print bg-amber-100/50 rounded-2xl p-4 text-center border border-amber-200/60 space-y-1">
            <p className="text-xs font-semibold text-amber-900">
              Need assistance with your order or bulk inquiries?
            </p>
            <p className="text-xs text-gray-600">
              Our Akkalkot team is happy to help! Contact us at{' '}
              <a href="mailto:support@swamiomenterprises.in" className="font-bold text-amber-800 underline">
                support@swamiomenterprises.in
              </a>{' '}
              or visit our{' '}
              <Link href={getLocalizedPath('/contact', countryCode)} className="font-bold text-amber-800 underline">
                Support Center
              </Link>.
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
