import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import jwt from "jsonwebtoken"
import nodemailer from "nodemailer"

/**
 * POST /store/customer/forgot-password
 * Body: { email: string }
 *
 * 1. Checks if customer email is registered.
 * 2. Generates signed password reset JWT token.
 * 3. Delivers password reset email via Nodemailer SMTP.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { email: rawEmail } = req.body as { email: string }
  if (!rawEmail) {
    return res.status(400).json({ success: false, message: "Email is required" })
  }

  const email = rawEmail.toLowerCase().trim()
  const logger = req.scope.resolve("logger")

  try {
    // 1. Verify customer exists in database
    const query = req.scope.resolve("query")
    const { data: customers } = await query.graph({
      entity: "customer",
      filters: { email },
      fields: ["id", "email", "first_name", "last_name"],
    })

    const customer = customers?.[0]
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "ACCOUNT_NOT_FOUND",
      })
    }

    // 2. Generate signed password reset JWT token
    const configModule = req.scope.resolve("configModule") as any
    const jwtSecret = configModule?.projectConfig?.http?.jwtSecret || process.env.JWT_SECRET || "supersecret"

    const resetToken = jwt.sign(
      {
        entity_id: email,
        actor_type: "customer",
        provider: "emailpass",
      },
      jwtSecret,
      { expiresIn: "1h" }
    )

    // Trigger Medusa internal auth reset-password workflow in background
    const port = process.env.PORT || 9000
    fetch(`http://localhost:${port}/auth/customer/emailpass/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
          ? { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY }
          : {}),
      },
      body: JSON.stringify({ identifier: email }),
    }).catch(() => null)

    const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:8000"
    const resetUrl = `${storefrontUrl}/in/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`

    // 3. Send password reset email via Nodemailer
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    })

    const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer"

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;border:1px solid #e5e5e5;">

        <!-- Header -->
        <tr><td style="background:#1a1a1a;padding:28px 32px;text-align:center;">
          <p style="color:#f59e0b;margin:0 0 4px;font-size:12px;font-weight:bold;letter-spacing:1px;">॥ श्री स्वामी समर्थ ॥</p>
          <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:1px;">Swami Om Enterprises</h1>
        </td></tr>

        <!-- Body Content -->
        <tr><td style="padding:32px 32px 24px;">
          <div style="font-size:36px;text-align:center;margin-bottom:16px;">🔑</div>
          <h2 style="margin:0 0 12px;font-size:20px;color:#111827;text-align:center;">Password Reset Request</h2>
          <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
            Hello ${customerName},
          </p>
          <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
            We received a request to reset the password for your account associated with <strong>${email}</strong>.
            Click the button below to choose a new password:
          </p>

          <!-- Reset Button -->
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetUrl}" style="background:#d97706;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
              Reset Your Password →
            </a>
          </div>

          <p style="margin:24px 0 0;color:#6b7280;font-size:12px;line-height:1.5;text-align:center;">
            If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
            <br>This link is valid for 1 hour.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            Swami Om Enterprises • Shri Swami Samarth Annachhatra Mandal Premises, Akkalkot
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`

    const text = `
PASSWORD RESET REQUEST — Swami Om Enterprises

Hello ${customerName},

We received a request to reset your password for ${email}.
Click or copy the link below to set a new password:

${resetUrl}

If you did not request this, please ignore this email.
Link valid for 1 hour.
`.trim()

    await transporter.sendMail({
      from: `${process.env.SMTP_FROM_NAME ?? "Swami Om Enterprises"} <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: `🔑 Password Reset Request — Swami Om Enterprises`,
      html,
      text,
    })

    logger.info(`📧 Password reset email delivered successfully to ${email}`)

    return res.status(200).json({
      success: true,
      message: "Password reset link sent successfully",
    })
  } catch (error: any) {
    logger.error(`[forgot-password] Error delivering reset email: ${error.message}`, error)
    return res.status(500).json({
      success: false,
      message: "Failed to send password reset email. Please try again.",
    })
  }
}
