import React, { useState, useRef, useEffect } from "react"
import { Container, Heading, Text, Button, Input, Label, Switch } from "@medusajs/ui"

interface GeneralTabProps {
  settings: Record<string, any>
  onSave: (updated: Record<string, any>) => Promise<void>
  isSaving: boolean
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ settings, onSave, isSaving }) => {
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(
    settings["store.maintenance_mode"]?.value === "true"
  )
  const [brandName, setBrandName] = useState<string>(
    settings["store.brand_name"]?.value || "Swami Om Enterprises"
  )
  const [supportEmail, setSupportEmail] = useState<string>(
    settings["store.support_email"]?.value || "support@swamiomenterprises.in"
  )
  const [supportPhone, setSupportPhone] = useState<string>(
    settings["store.support_phone"]?.value || ""
  )
  const [defaultCurrency, setDefaultCurrency] = useState<string>(
    settings["store.default_currency"]?.value || "INR"
  )

  // Dynamic Logo States
  const currentLogoUrl = settings["store.logo_url"]?.value || ""
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false)
  const [isDeletingLogo, setIsDeletingLogo] = useState<boolean>(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [logoFeedbackMsg, setLogoFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    setMaintenanceMode(settings["store.maintenance_mode"]?.value === "true")
    setBrandName(settings["store.brand_name"]?.value || "Swami Om Enterprises")
    setSupportEmail(settings["store.support_email"]?.value || "support@swamiomenterprises.in")
    setSupportPhone(settings["store.support_phone"]?.value || "")
    setDefaultCurrency(settings["store.default_currency"]?.value || "INR")
  }, [settings])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoFeedbackMsg(null)
    const file = e.target.files?.[0]
    if (!file) return

    // 1. Validate MIME type & extension
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]
    const fileExt = file.name.split(".").pop()?.toLowerCase() || ""
    const validExts = ["png", "jpg", "jpeg", "webp", "svg"]
    if (!validTypes.includes(file.type.toLowerCase()) && !validExts.includes(fileExt)) {
      setLogoFeedbackMsg({
        type: "error",
        text: "Invalid image format. Allowed formats: PNG, JPG, JPEG, WebP, SVG.",
      })
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    // 2. Validate File Size (max 5MB)
    const maxSizeBytes = 5 * 1024 * 1024
    if (file.size > maxSizeBytes) {
      setLogoFeedbackMsg({
        type: "error",
        text: "File size is too large. Please upload an image smaller than 5 MB.",
      })
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    setSelectedFile(file)

    // Generate local preview URL for instant UI preview
    const reader = new FileReader()
    reader.onload = () => {
      setPreviewDataUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleCancelSelection = () => {
    setSelectedFile(null)
    setPreviewDataUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleUploadLogo = async () => {
    if (!selectedFile) return
    setIsUploadingLogo(true)
    setLogoFeedbackMsg(null)

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)

      const res = await fetch("/admin/store-settings/logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Failed to upload store logo")
      }

      setLogoFeedbackMsg({ type: "success", text: "Store logo updated successfully! Changes reflect across the storefront." })
      setSelectedFile(null)
      setPreviewDataUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ""

      // Sync settings state
      await onSave({ "store.logo_url": data.logo_url })
    } catch (err: any) {
      setLogoFeedbackMsg({ type: "error", text: err.message || "Failed to upload store logo" })
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleDeleteLogo = async () => {
    setIsDeletingLogo(true)
    setLogoFeedbackMsg(null)

    try {
      const res = await fetch("/admin/store-settings/logo", {
        method: "DELETE",
        credentials: "include",
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete store logo")
      }

      setLogoFeedbackMsg({ type: "success", text: "Custom logo deleted. Storefront has reverted to the default logo." })
      setShowDeleteConfirm(false)
      setSelectedFile(null)
      setPreviewDataUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ""

      // Sync settings state
      await onSave({ "store.logo_url": "" })
    } catch (err: any) {
      setLogoFeedbackMsg({ type: "error", text: err.message || "Failed to delete store logo" })
    } finally {
      setIsDeletingLogo(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedbackMsg(null)
    try {
      await onSave({
        "store.maintenance_mode": maintenanceMode ? "true" : "false",
        "store.brand_name": brandName,
        "store.support_email": supportEmail,
        "store.support_phone": supportPhone,
        "store.default_currency": defaultCurrency,
      })
      setFeedbackMsg({ type: "success", text: "General store settings saved successfully!" })
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Failed to save store settings" })
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── 1. STORE LOGO MANAGEMENT CARD ─── */}
      <Container className="p-6 bg-ui-bg-base border border-ui-border-base rounded-xl space-y-6">
        <div className="flex items-center justify-between border-b border-ui-border-base pb-4">
          <div>
            <Heading level="h2" className="text-lg font-bold text-ui-fg-base flex items-center gap-2">
              <span>🖼️</span> Storefront Logo
            </Heading>
            <Text className="text-xs text-ui-fg-subtle mt-1">
              Upload, preview, replace, or delete your storefront logo. The active logo dynamically displays across header navbar, mobile menu, footer, invoice receipt, and emails.
            </Text>
          </div>
          <div>
            {currentLogoUrl ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span> Custom Active Logo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-ui-bg-subtle text-ui-fg-subtle border border-ui-border-base">
                Default System Logo
              </span>
            )}
          </div>
        </div>

        {logoFeedbackMsg && (
          <div
            className={`p-3.5 rounded-lg text-sm font-medium ${
              logoFeedbackMsg.type === "success"
                ? "bg-emerald-950/60 border border-emerald-700/80 text-emerald-200"
                : "bg-rose-950/60 border border-rose-700/80 text-rose-200"
            }`}
          >
            {logoFeedbackMsg.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Active / Current Logo Preview */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-ui-fg-subtle uppercase tracking-wider">
              Current Live Logo
            </Label>
            <div className="h-44 rounded-xl border border-ui-border-base bg-ui-bg-subtle flex flex-col items-center justify-center p-4 relative overflow-hidden group">
              {currentLogoUrl ? (
                <div className="relative flex flex-col items-center justify-center h-full w-full">
                  <img
                    src={currentLogoUrl}
                    alt="Active Store Logo"
                    className="max-h-28 max-w-full object-contain filter drop-shadow-sm transition-transform duration-200 group-hover:scale-105"
                  />
                  <span className="text-[11px] text-ui-fg-muted mt-2 font-mono truncate max-w-xs">
                    {currentLogoUrl}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4 space-y-2">
                  <div className="h-14 w-28 rounded-lg bg-ui-bg-base border border-dashed border-ui-border-base flex items-center justify-center text-ui-fg-muted font-bold text-xs tracking-wider">
                    DEFAULT LOGO
                  </div>
                  <Text className="text-xs text-ui-fg-muted">
                    No custom logo uploaded. Storefront is displaying the bundled default logo (<code className="text-[11px] bg-ui-bg-base px-1 py-0.5 rounded">/logo/logo.png</code>).
                  </Text>
                </div>
              )}
            </div>

            {currentLogoUrl && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="danger"
                  size="small"
                  onClick={() => setShowDeleteConfirm(true)}
                  isLoading={isDeletingLogo}
                >
                  Delete Custom Logo
                </Button>
              </div>
            )}
          </div>

          {/* Upload / Replace Staging Area */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-ui-fg-subtle uppercase tracking-wider">
              {currentLogoUrl ? "Replace Store Logo" : "Upload New Store Logo"}
            </Label>

            {previewDataUrl ? (
              <div className="h-44 rounded-xl border-2 border-dashed border-ui-border-interactive bg-ui-bg-field flex flex-col items-center justify-center p-4 relative">
                <img
                  src={previewDataUrl}
                  alt="Staged Preview"
                  className="max-h-24 max-w-full object-contain filter drop-shadow-sm"
                />
                <div className="mt-2 text-center">
                  <p className="text-xs font-semibold text-ui-fg-base truncate max-w-xs">{selectedFile?.name}</p>
                  <p className="text-[11px] text-ui-fg-subtle">
                    {selectedFile ? (selectedFile.size / 1024).toFixed(1) : 0} KB
                  </p>
                </div>
              </div>
            ) : (
              <label
                htmlFor="store-logo-file-input"
                className="h-44 rounded-xl border-2 border-dashed border-ui-border-base hover:border-ui-border-interactive bg-ui-bg-subtle hover:bg-ui-bg-field flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-150"
              >
                <div className="h-10 w-10 rounded-full bg-ui-bg-base border border-ui-border-base flex items-center justify-center text-ui-fg-muted mb-2 shadow-xs">
                  📁
                </div>
                <p className="text-xs font-semibold text-ui-fg-base">
                  Click to select or drag & drop logo image
                </p>
                <p className="text-[11px] text-ui-fg-subtle mt-1">
                  Supported formats: PNG, JPG, JPEG, WebP, SVG (Max size: 5MB)
                </p>
              </label>
            )}

            <input
              ref={fileInputRef}
              id="store-logo-file-input"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif"
              onChange={handleFileChange}
              className="hidden"
            />

            {previewDataUrl && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={handleCancelSelection}
                  disabled={isUploadingLogo}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="small"
                  onClick={handleUploadLogo}
                  isLoading={isUploadingLogo}
                >
                  {currentLogoUrl ? "Save & Replace Logo" : "Save & Upload Logo"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal/Prompt */}
        {showDeleteConfirm && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div className="space-y-1">
                <p className="text-sm font-bold text-rose-200">
                  Confirm Logo Deletion
                </p>
                <p className="text-xs text-rose-300/80">
                  Are you sure you want to delete the custom logo? The storefront and all invoices/emails will automatically revert to using the default logo (<code className="text-rose-200">/logo/logo.png</code>).
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeletingLogo}
              >
                Keep Current Logo
              </Button>
              <Button
                type="button"
                variant="danger"
                size="small"
                onClick={handleDeleteLogo}
                isLoading={isDeletingLogo}
              >
                Yes, Delete Logo
              </Button>
            </div>
          </div>
        )}
      </Container>

      {/* ─── 2. GENERAL STORE BRANDING & DEFAULTS CARD ─── */}
      <form onSubmit={handleSubmit}>
        <Container className="p-6 bg-ui-bg-base border border-ui-border-base rounded-xl space-y-6">
          <div className="flex items-center justify-between border-b border-ui-border-base pb-4">
            <div>
              <Heading level="h2" className="text-lg font-bold text-ui-fg-base flex items-center gap-2">
                <span>⚙️</span> General Store Branding & Operational Preferences
              </Heading>
              <Text className="text-xs text-ui-fg-subtle mt-1">
                Configure store maintenance status, support details, and default operational preferences.
              </Text>
            </div>
          </div>

          {feedbackMsg && (
            <div
              className={`p-3.5 rounded-lg text-sm font-medium ${
                feedbackMsg.type === "success"
                  ? "bg-emerald-950/60 border border-emerald-700/80 text-emerald-200"
                  : "bg-rose-950/60 border border-rose-700/80 text-rose-200"
              }`}
            >
              {feedbackMsg.text}
            </div>
          )}

          <div className="space-y-6">
            {/* Maintenance Mode */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base">
              <div>
                <Label className="text-sm font-semibold text-ui-fg-base">Storefront Maintenance Mode</Label>
                <Text className="text-xs text-ui-fg-subtle">
                  When enabled, storefront APIs can notify customers of ongoing site maintenance.
                </Text>
              </div>
              <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Store Brand Name */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-ui-fg-subtle">Store Brand Name</Label>
                <Input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Default Currency */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-ui-fg-subtle">Default Store Currency</Label>
                <select
                  value={defaultCurrency}
                  onChange={(e) => setDefaultCurrency(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-ui-bg-field border border-ui-border-base text-ui-fg-base text-sm focus:outline-none focus:ring-2 focus:ring-ui-fg-interactive"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              {/* Support Email */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-ui-fg-subtle">Support Email</Label>
                <Input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Support Phone */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-ui-fg-subtle">Support Phone Number</Label>
                <Input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-ui-border-base">
            <Button type="submit" variant="primary" size="small" isLoading={isSaving}>
              Save Store Settings
            </Button>
          </div>
        </Container>
      </form>
    </div>
  )
}
