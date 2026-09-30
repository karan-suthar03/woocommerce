import React, { useState, useEffect } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Button } from "@medusajs/ui"
import { DataResetTab } from "./components/data-reset-tab"
import { GeneralTab } from "./components/general-tab"
import { SmtpTab } from "./components/smtp-tab"

// Custom Store Settings Icon for Sidebar
const SettingsIcon = () => (
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
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

type ActiveTab = "smtp" | "general" | "reset"

const StoreSettingsPage = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("smtp")
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/admin/store-settings", {
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const data = await res.json()
      setSettings(data.settings || {})
    } catch (err: any) {
      setError(err.message || "Failed to load store settings")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleSaveSettings = async (updatedKv: Record<string, any>) => {
    setIsSaving(true)
    try {
      const res = await fetch("/admin/store-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings: updatedKv }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Failed to save settings")
      }
      setSettings(data.settings || {})
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-full max-w-none px-4 sm:px-8 py-6 space-y-6 min-h-screen bg-ui-bg-base text-ui-fg-base">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ui-border-base pb-5">
        <div>
          <Heading level="h1" className="text-2xl font-bold text-ui-fg-base flex items-center gap-2.5">
            <SettingsIcon /> Store Settings
          </Heading>
          <Text className="text-ui-fg-subtle text-sm mt-1">
            Manage SMTP email configuration, general store settings, and protected data resets.
          </Text>
        </div>

        <Button
          size="small"
          variant="secondary"
          onClick={fetchSettings}
          isLoading={isLoading}
        >
          Refresh Settings
        </Button>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-ui-border-base pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("smtp")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "smtp"
              ? "bg-ui-bg-base-hover text-ui-fg-base border border-ui-border-base shadow-xs"
              : "text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-subtle"
          }`}
        >
          <span>📧</span> SMTP Email Setup
        </button>

        <button
          onClick={() => setActiveTab("general")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "general"
              ? "bg-ui-bg-base-hover text-ui-fg-base border border-ui-border-base shadow-xs"
              : "text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-subtle"
          }`}
        >
          <span>⚙️</span> General Branding
        </button>

        <button
          onClick={() => setActiveTab("reset")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "reset"
              ? "bg-rose-950/50 text-rose-300 border border-rose-800 shadow-xs"
              : "text-rose-400/70 hover:text-rose-300 hover:bg-rose-950/30"
          }`}
        >
          <span>🚨</span> E-Commerce Data Reset
        </button>
      </div>

      {/* Error Alert Box */}
      {error && (
        <Container className="p-4 bg-rose-950/50 border border-rose-800/80 text-rose-200 rounded-lg text-sm flex items-center justify-between shadow-xs">
          <div>
            <strong className="font-semibold">Error loading store settings:</strong> {error}
          </div>
          <Button size="small" variant="transparent" className="text-rose-200 hover:text-white underline" onClick={fetchSettings}>
            Retry
          </Button>
        </Container>
      )}

      {/* Tab Contents */}
      {isLoading ? (
        <Container className="p-8 text-center text-ui-fg-subtle text-sm animate-pulse">
          Loading store configuration details...
        </Container>
      ) : (
        <>
          {activeTab === "smtp" && (
            <SmtpTab
              settings={settings}
              onSave={handleSaveSettings}
              isSaving={isSaving}
            />
          )}

          {activeTab === "general" && (
            <GeneralTab
              settings={settings}
              onSave={handleSaveSettings}
              isSaving={isSaving}
            />
          )}

          {activeTab === "reset" && <DataResetTab />}
        </>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Store Settings",
  icon: SettingsIcon,
})

export default StoreSettingsPage
