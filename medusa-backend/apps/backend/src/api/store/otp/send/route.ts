import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OTP_VERIFICATION_MODULE } from "../../../../modules/otp-verification"
import { generateOTPEmail } from "../../../../modules/otp-verification/templates/otp-email"
import nodemailer from "nodemailer"
import { Client } from "pg"

/**
 * POST /store/otp/send
 * Send OTP verification code to email.
 *
 * Before dispatching an OTP we perform TWO independent duplicate checks:
 *  1. Medusa customer entity (via the graph query) — catches fully-created accounts.
 *  2. Medusa auth_identity table (via a raw PG query) — catches orphaned auth
 *     registrations where sdk.auth.register() completed but customer.create()
 *     failed, or where the customer record was deleted but the identity persists.
 *
 * Both checks operate on the lowercase-trimmed email to avoid case-sensitivity
 * false-negatives that previously allowed the OTP to be sent / verified
 * successfully before crashing at sdk.auth.register() with
 * "Identity with email already exists".
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve("logger")
  const rawEmail = (req.body as { email?: string })?.email ?? ""
  // Normalise once — all downstream ops use this canonical form.
  const email = rawEmail.toLowerCase().trim()

  if (!email || !email.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "Valid email address is required",
    })
  }

  try {
    // ── Check 1: Customer entity ────────────────────────────────────────────
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    const { data: existingCustomers } = await query.graph({
      entity: "customer",
      filters: { email },
      fields: ["id", "email"],
    })

    if (existingCustomers && existingCustomers.length > 0) {
      return res.status(400).json({
        success: false,
        errorCode: "EMAIL_EXISTS",
        message:
          "An account with this email already exists. Please sign in instead.",
      })
    }

    // ── Check 2: Auth identity table ────────────────────────────────────────
    // sdk.auth.register() stores credentials in the auth_identity table keyed
    // by provider_identity (email/password provider). We check this directly
    // so that partial/orphaned registrations are caught before we send an OTP
    // that can never lead to a successful account creation.
    let authIdentityExists = false
    const pgClient = new Client({ connectionString: process.env.DATABASE_URL })
    try {
      await pgClient.connect()

      const authResult = await pgClient.query(
        `SELECT id FROM auth_identity
         WHERE id IN (
           SELECT auth_identity_id FROM provider_identity
           WHERE entity_id = $1
             AND provider = 'emailpass'
         )
         LIMIT 1`,
        [email]
      )
      authIdentityExists = (authResult.rowCount ?? 0) > 0
    } catch (dbErr: any) {
      logger.warn(`Auth identity check failed (non-fatal): ${dbErr.message}`)
    } finally {
      await pgClient.end().catch(() => {})
    }

    if (authIdentityExists) {
      return res.status(400).json({
        success: false,
        errorCode: "EMAIL_EXISTS",
        message:
          "An account with this email already exists. Please sign in instead.",
      })
    }

    // ── Generate & send OTP ─────────────────────────────────────────────────
    const otpService = req.scope.resolve(OTP_VERIFICATION_MODULE)

    const ipAddress =
      (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress
    const userAgent = req.headers["user-agent"] as string

    const { otp, expiresAt } = await otpService.createOTP(
      email,
      ipAddress,
      userAgent
    )

    const emailContent = generateOTPEmail(otp, 10)

    // ── Validate SMTP config before attempting send ─────────────────────────
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASSWORD
    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com"
    const smtpFromEmail = process.env.SMTP_FROM_EMAIL

    if (!smtpUser || !smtpPass || !smtpFromEmail) {
      logger.error(
        `SMTP configuration incomplete. SMTP_USER=${!!smtpUser} SMTP_PASSWORD=${!!smtpPass} SMTP_FROM_EMAIL=${!!smtpFromEmail}`
      )
      return res.status(500).json({
        success: false,
        message:
          "Email service is not configured. Please contact support.",
      })
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    try {
      await transporter.sendMail({
        from: `${process.env.SMTP_FROM_NAME || "Swami Om Enterprises"} <${smtpFromEmail}>`,
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      })
    } catch (smtpError: any) {
      // Log full SMTP error details to backend console for debugging
      logger.error(
        `SMTP send failed for ${email}: ` +
          `code=${smtpError.code} ` +
          `responseCode=${smtpError.responseCode} ` +
          `command=${smtpError.command} ` +
          `message=${smtpError.message}`
      )

      // Distinguish SMTP auth failures from other SMTP errors
      if (
        smtpError.code === "EAUTH" ||
        smtpError.responseCode === 535 ||
        smtpError.responseCode === 534
      ) {
        return res.status(500).json({
          success: false,
          message:
            "Email service authentication failed. Please contact support.",
        })
      }

      if (smtpError.code === "ECONNECTION" || smtpError.code === "ETIMEDOUT") {
        return res.status(503).json({
          success: false,
          message:
            "Email service is temporarily unavailable. Please try again in a moment.",
        })
      }

      return res.status(500).json({
        success: false,
        message: "Failed to send verification code. Please try again.",
      })
    }

    logger.info(`OTP sent successfully to ${email}`)

    return res.status(200).json({
      success: true,
      message: "Verification code sent to your email",
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error: any) {
    logger.error(`OTP send error: ${error.message}`)

    if (error.message.includes("wait") || error.message.includes("limit")) {
      return res.status(429).json({
        success: false,
        message: error.message,
      })
    }

    return res.status(500).json({
      success: false,
      message: "Failed to send verification code. Please try again.",
    })
  }
}
