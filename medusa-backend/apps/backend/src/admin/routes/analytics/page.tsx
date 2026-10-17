import React, { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import { KPICards } from "./components/kpi-cards"
import { SalesChart } from "./components/sales-chart"
import { TopProductsTable } from "./components/top-products-table"
import { LowStockTable } from "./components/low-stock-table"
import { RecentOrdersTable } from "./components/recent-orders-table"
import { StoreInsights } from "./components/store-insights"
import { DateRangePicker, DateRangePreset } from "./components/date-range-picker"

// Custom Chart/Analytics Icon for Medusa Admin Sidebar
const AnalyticsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>
)

const AnalyticsDashboardPage = () => {
  const [preset, setPreset] = useState<DateRangePreset>("30d")
  const [overview, setOverview] = useState<any>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [lowStock, setLowStock] = useState<any[]>([])
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Calculate Date Range
  const getDateRange = (selectedPreset: DateRangePreset) => {
    const now = new Date()
    let from: Date | null = null

    if (selectedPreset === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (selectedPreset === "7d") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (selectedPreset === "30d") {
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else if (selectedPreset === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    return {
      from: from ? from.toISOString() : "",
      to: now.toISOString(),
    }
  }

  const fetchDashboardData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { from, to } = getDateRange(preset)
      const queryParams = new URLSearchParams()
      if (from) queryParams.append("from", from)
      if (to) queryParams.append("to", to)

      const fetchOpts: RequestInit = {
        credentials: "include",
        headers: {
          "Accept": "application/json",
        },
      }

      const [resOverview, resCharts, resTop] = await Promise.all([
        fetch(`/admin/analytics/overview?${queryParams.toString()}`, fetchOpts),
        fetch(`/admin/analytics/charts?${queryParams.toString()}&interval=day`, fetchOpts),
        fetch(`/admin/analytics/top-products?limit=6&low_stock_threshold=10`, fetchOpts),
      ])

      const errorParts: string[] = []
      if (!resOverview.ok) errorParts.push(`Overview: ${resOverview.status}`)
      if (!resCharts.ok) errorParts.push(`Charts: ${resCharts.status}`)
      if (!resTop.ok) errorParts.push(`Top Products: ${resTop.status}`)

      if (errorParts.length > 0) {
        throw new Error(`Failed to fetch analytics data (${errorParts.join(", ")})`)
      }

      const overviewData = await resOverview.json()
      const chartsData = await resCharts.json()
      const topData = await resTop.json()

      setOverview(overviewData.metrics || null)
      setChartData(chartsData.chart_data || [])
      setTopProducts(topData.top_products || [])
      setLowStock(topData.low_stock_items || [])
      setRecentOrders(topData.recent_orders || [])
    } catch (err: any) {
      setError(err.message || "An error occurred while loading dashboard")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [preset])

  return (
    <div className="w-full max-w-none px-4 sm:px-8 py-6 space-y-6 min-h-screen bg-ui-bg-base text-ui-fg-base">
      {/* Top Navigation & Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ui-border-base pb-5">
        <div>
          <Heading level="h1" className="text-2xl font-bold text-ui-fg-base flex items-center gap-2.5">
            <AnalyticsIcon /> Store Analytics Dashboard
          </Heading>
          <Text className="text-ui-fg-subtle text-sm mt-1">
            Real-time sales performance, revenue metrics, orders, customer stats & inventory health
          </Text>
        </div>

        <div className="flex items-center gap-3">
          <DateRangePicker value={preset} onChange={setPreset} />
          <Button
            size="small"
            variant="secondary"
            onClick={fetchDashboardData}
            isLoading={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert Box */}
      {error && (
        <Container className="p-4 bg-rose-950/50 border border-rose-800/80 text-rose-200 rounded-lg text-sm flex items-center justify-between shadow-xs">
          <div>
            <strong className="font-semibold">Error loading dashboard:</strong> {error}
          </div>
          <Button size="small" variant="transparent" className="text-rose-200 hover:text-white underline" onClick={fetchDashboardData}>
            Retry
          </Button>
        </Container>
      )}

      {/* KPI Cards Section */}
      <KPICards metrics={overview} isLoading={isLoading} />

      {/* Main Full-Width Sales Chart */}
      <SalesChart data={chartData} isLoading={isLoading} />

      {/* Split Grid: Top Products & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <TopProductsTable products={topProducts} isLoading={isLoading} />
        <LowStockTable items={lowStock} isLoading={isLoading} />
      </div>

      {/* Live Recent Orders Feed */}
      <RecentOrdersTable orders={recentOrders} isLoading={isLoading} />

      <StoreInsights {...getDateRange(preset)} refreshKey={preset} />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Analytics",
  icon: AnalyticsIcon,
})

export default AnalyticsDashboardPage
