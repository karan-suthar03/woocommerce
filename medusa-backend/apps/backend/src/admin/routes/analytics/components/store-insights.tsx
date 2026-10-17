import React, { useEffect, useState } from "react"
import { Container, Heading, Text } from "@medusajs/ui"
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

type Bucket = { name: string; revenue: number; orders: number }
type Insights = {
  total_orders: number
  total_revenue: number
  by_category: Bucket[]
  top_cities: Bucket[]
  top_states: Bucket[]
  customers: { new: number; returning: number }
}

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)

const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <Container className="p-4 sm:p-6 shadow-xs border border-ui-border-base rounded-lg bg-ui-bg-subtle flex flex-col gap-y-3">
    <div>
      <Heading level="h2" className="text-lg font-semibold text-ui-fg-base">{title}</Heading>
      {subtitle && <Text size="small" className="text-ui-fg-subtle">{subtitle}</Text>}
    </div>
    {children}
  </Container>
)

// Horizontal bars, widest = highest revenue in the list.
const Bars: React.FC<{ rows: Bucket[]; empty: string }> = ({ rows, empty }) => {
  if (!rows.length) return <Text size="small" className="text-ui-fg-muted">{empty}</Text>
  const max = Math.max(...rows.map((r) => r.revenue), 1)
  return (
    <div className="flex flex-col gap-y-2.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex justify-between text-sm">
            <span className="text-ui-fg-base font-medium truncate">{r.name}</span>
            <span className="text-ui-fg-subtle shrink-0 ml-2">
              {inr(r.revenue)} · {r.orders} {r.orders === 1 ? "order" : "orders"}
            </span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-ui-bg-base overflow-hidden">
            <div className="h-full rounded-full bg-ui-fg-interactive" style={{ width: `${(r.revenue / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Warm saffron/maroon palette, darkest first.
const COLORS = ["#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa"]

const Donut: React.FC<{ rows: { name: string; value: number }[]; money?: boolean }> = ({ rows, money = true }) => {
  if (!rows.length || rows.every((r) => !r.value)) {
    return <Text size="small" className="text-ui-fg-muted">No data in this period.</Text>
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
            {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => (money ? inr(Number(v)) : v)} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

const CityBars: React.FC<{ rows: Bucket[] }> = ({ rows }) => {
  if (!rows.length) return <Text size="small" className="text-ui-fg-muted">No deliveries in this period.</Text>
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
          <YAxis tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} tick={{ fontSize: 12 }} width={48} />
          <Tooltip formatter={(v: any) => inr(Number(v))} cursor={{ fill: "rgba(234,88,12,0.08)" }} />
          <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
            {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-lg border border-ui-border-base bg-ui-bg-base p-3">
    <Text size="xsmall" className="text-ui-fg-subtle uppercase tracking-wide">{label}</Text>
    <Text className="text-xl font-semibold text-ui-fg-base mt-0.5">{value}</Text>
    {hint && <Text size="xsmall" className="text-ui-fg-muted">{hint}</Text>}
  </div>
)

export const StoreInsights: React.FC<{ from: string; to: string; refreshKey: string }> = ({ from, to, refreshKey }) => {
  const [data, setData] = useState<Insights | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (from) params.append("from", from)
    if (to) params.append("to", to)
    setError(null)
    fetch(`/admin/analytics/insights?${params}`, { credentials: "include" })
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.message || `HTTP ${r.status}`)
        setData(body.insights)
      })
      .catch((e) => setError(e.message))
    // refreshKey (the date preset) drives refetches; from/to change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  if (error) return <Text className="text-ui-fg-error">Store insights: {error}</Text>
  if (!data) return <Text size="small" className="text-ui-fg-muted">Loading store insights…</Text>

  const totalCustomers = data.customers.new + data.customers.returning
  const returningShare = totalCustomers ? Math.round((data.customers.returning / totalCustomers) * 100) : 0

  return (
    <div className="flex flex-col gap-y-6 w-full">
      <Heading level="h1" className="text-xl font-semibold">Store insights</Heading>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Orders" value={`${data.total_orders}`} />
        <Stat label="Revenue" value={inr(data.total_revenue)} />
        <Stat label="New customers" value={`${data.customers.new}`} />
        <Stat label="Returning customers" value={`${data.customers.returning}`} hint={`${returningShare}% of buyers`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Revenue by category">
          <Donut rows={data.by_category.map((b) => ({ name: b.name, value: b.revenue }))} />
        </Card>
        <Card title="Revenue by city" subtitle="Top delivery cities in this period">
          <CityBars rows={data.top_cities} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="By category" subtitle="Revenue and orders per product category">
          <Bars rows={data.by_category} empty="No sales in this period." />
        </Card>
        <Card title="Top states" subtitle="By delivery address">
          <Bars rows={data.top_states} empty="No deliveries in this period." />
        </Card>
      </div>
    </div>
  )
}
