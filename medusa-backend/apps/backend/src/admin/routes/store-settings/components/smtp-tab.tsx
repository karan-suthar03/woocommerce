import React, { useState, useEffect } from "react"
import { Container, Heading, Text, Input, Button, Label, Badge, toast } from "@medusajs/ui"

interface SmtpTabProps {
  settings: Record<string, any>
  onSave: (updates: Record<string, any>) => Promise<void>
  isSaving: boolean
}

export const SmtpTab: React.FC<SmtpTabProps> = ({ settings, onSave, isSaving }) => {
  const [formData, setFormData] = useState({
    "smtp.host": "",
    "smtp.port": "",
    "smtp.user": "",
    "smtp.password": "",
    "smtp.from_email": "",
    "smtp.from_name": "",
  })

  const [isTesting, setIsTesting] = useState(false)
  const [testEmail, setTestEmail] = useState("")

  useEffect(() => {
    setFormData({
      "smtp.host": settings["smtp.host"]?.value || "",
      "smtp.port": settings["smtp.port"]?.value || "",
      "smtp.user": settings["smtp.user"]?.value || "",
      "smtp.password": settings["smtp.password"]?.value || "",
      "smtp.from_email": settings["smtp.from_email"]?.value || "",
      "smtp.from_name": settings["smtp.from_name"]?.value || "",
    })
  }, [settings])

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await onSave(formData)
      toast.success("SMTP Settings Saved", {
        description: "SMTP configuration has been updated successfully.",
      })
    } catch (error: any) {
      toast.error("Save Failed", {
        description: error.message || "Failed to save SMTP settings",
      })
    }
  }

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error("Email Required", {
        description: "Please enter an email address to send the test email to.",
      })
      return
    }

    setIsTesting(true)
    try {
      const res = await fetch("/admin/smtp-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: testEmail }),
      })

      const contentType = res.headers.get("content-type") || ""
      let data: any = {}

      if (contentType.includes("application/json")) {
        data = await res.json()
      } else {
        const text = await res.text()
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status} (${res.statusText || "Non-JSON response"})`)
        }
      }

      if (!res.ok) {
        throw new Error(data.message || "Failed to send test email")
      }

      toast.success("Test Email Sent", {
        description: `Test email successfully sent to ${testEmail}. Check your inbox.`,
      })
    } catch (error: any) {
      toast.error("Test Failed", {
        description: error.message || "Failed to send test email",
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Container className="p-6 space-y-6 bg-ui-bg-subtle border border-ui-border-base rounded-lg shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <Heading level="h2" className="text-lg font-semibold text-ui-fg-base flex items-center gap-2">
            📧 SMTP Configuration
          </Heading>
          <Text className="text-ui-fg-subtle text-sm mt-1">
            Configure SMTP settings for sending OTP verification emails and transactional notifications.
            Using Gmail SMTP requires an App Password (not your regular password).
          </Text>
        </div>
        <Badge color="blue" size="small">
          OTP Emails
        </Badge>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* SMTP Host */}
        <div className="space-y-2">
          <Label htmlFor="smtp-host" className="text-sm font-medium text-ui-fg-base">
            SMTP Host
          </Label>
          <Input
            id="smtp-host"
            type="text"
            placeholder="smtp.gmail.com"
            value={formData["smtp.host"]}
            onChange={(e) => handleChange("smtp.host", e.target.value)}
            className="w-full"
          />
          <Text className="text-xs text-ui-fg-subtle">
            The SMTP server hostname (e.g., smtp.gmail.com for Gmail)
          </Text>
        </div>

        {/* SMTP Port */}
        <div className="space-y-2">
          <Label htmlFor="smtp-port" className="text-sm font-medium text-ui-fg-base">
            SMTP Port
          </Label>
          <Input
            id="smtp-port"
            type="number"
            placeholder="587"
            value={formData["smtp.port"]}
            onChange={(e) => handleChange("smtp.port", e.target.value)}
            className="w-full"
          />
          <Text className="text-xs text-ui-fg-subtle">
            Port number (587 for TLS, 465 for SSL)
          </Text>
        </div>

        {/* SMTP User */}
        <div className="space-y-2">
          <Label htmlFor="smtp-user" className="text-sm font-medium text-ui-fg-base">
            SMTP Username / Email
          </Label>
          <Input
            id="smtp-user"
            type="email"
            placeholder="your-email@gmail.com"
            value={formData["smtp.user"]}
            onChange={(e) => handleChange("smtp.user", e.target.value)}
            className="w-full"
          />
          <Text className="text-xs text-ui-fg-subtle">
            Your Gmail email address or SMTP username
          </Text>
        </div>

        {/* SMTP Password */}
        <div className="space-y-2">
          <Label htmlFor="smtp-password" className="text-sm font-medium text-ui-fg-base">
            SMTP Password / App Password
          </Label>
          <Input
            id="smtp-password"
            type="password"
            placeholder="Enter App Password (not your regular password)"
            value={formData["smtp.password"]}
            onChange={(e) => handleChange("smtp.password", e.target.value)}
            className="w-full font-mono"
          />
          <div className="bg-blue-950/30 border border-blue-800/50 rounded p-3 text-xs text-blue-200">
            <strong>🔐 For Gmail:</strong> Generate an App Password at{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-100"
            >
              Google App Passwords
            </a>
            . Requires 2FA enabled on your account.
          </div>
        </div>

        {/* From Email */}
        <div className="space-y-2">
          <Label htmlFor="smtp-from-email" className="text-sm font-medium text-ui-fg-base">
            From Email Address
          </Label>
          <Input
            id="smtp-from-email"
            type="email"
            placeholder="noreply@yourstore.com"
            value={formData["smtp.from_email"]}
            onChange={(e) => handleChange("smtp.from_email", e.target.value)}
            className="w-full"
          />
          <Text className="text-xs text-ui-fg-subtle">
            The email address that will appear as the sender
          </Text>
        </div>

        {/* From Name */}
        <div className="space-y-2">
          <Label htmlFor="smtp-from-name" className="text-sm font-medium text-ui-fg-base">
            From Name
          </Label>
          <Input
            id="smtp-from-name"
            type="text"
            placeholder="Your Store Name"
            value={formData["smtp.from_name"]}
            onChange={(e) => handleChange("smtp.from_name", e.target.value)}
            className="w-full"
          />
          <Text className="text-xs text-ui-fg-subtle">
            The name that will appear as the sender (e.g., "Swami Om Enterprises")
          </Text>
        </div>

        {/* Test Email Section */}
        <div className="border-t border-ui-border-base pt-5 space-y-3">
          <Label className="text-sm font-medium text-ui-fg-base">
            Test Email Configuration
          </Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter email to test"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleTestEmail}
              isLoading={isTesting}
              disabled={isTesting}
            >
              Send Test Email
            </Button>
          </div>
          <Text className="text-xs text-ui-fg-subtle">
            Send a test email to verify your SMTP configuration is working correctly
          </Text>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-ui-border-base">
          <Button type="submit" variant="primary" isLoading={isSaving} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save SMTP Settings"}
          </Button>
        </div>
      </form>

      {/* Info Box */}
      <div className="bg-ui-bg-base border border-ui-border-base rounded-lg p-4 space-y-2">
        <Text className="text-sm font-medium text-ui-fg-base">📌 Important Notes:</Text>
        <ul className="text-xs text-ui-fg-subtle space-y-1 list-disc list-inside">
          <li>These settings are used for sending OTP verification emails to customers</li>
          <li>For Gmail, you must enable 2-Factor Authentication and generate an App Password</li>
          <li>Never share your App Password - it provides full access to your email account</li>
          <li>Changes take effect immediately after saving</li>
          <li>Test your configuration after making changes to ensure emails are delivered</li>
        </ul>
      </div>
    </Container>
  )
}
