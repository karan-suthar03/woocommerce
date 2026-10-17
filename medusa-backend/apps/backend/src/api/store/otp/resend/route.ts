import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { OTP_VERIFICATION_MODULE } from "../../../../modules/otp-verification"
import { generateOTPEmail } from "../../../../modules/otp-verification/templates/otp-email"
import nodemailer from "nodemailer"

/**
 * POST /store/otp/resend
 * Resend OTP verification code to an email that already has an active OTP record.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve("logger")
  const rawEmail = (req.body as { email?: string })?.email ?? ""
  const email = rawEmail.toLowerCase().trim()

  if (!email || !email.includes("@")) {
    return res.status(400).json({
      success: false,
      message: "Valid email address is required",
    })
  }

  try {
    const otpService = req.scope.resolve(OTP_VERIFICATION_MODULE)

    const ipAddress =
      (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress
    const userAgent = req.headers["user-agent"] as string

    // createOTP handles the resend cooldown / rate-limit logic internally
    const { otp, expiresAt } = await otpService.createOTP(
      email,
      ipAddress,
      userAgent
    )

    const emailContent = generateOTPEmail(otp, 10)

    // ── Validate SMTP config ──────────────────────────────────────────────────
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASSWORD
    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com"
    const smtpFromEmail = process.env.SMTP_FROM_EMAIL

    if (!smtpUser || !smtpPass || !smtpFromEmail) {
      logger.error(
        `SMTP configuration incomplete for resend. SMTP_USER=${!!smtpUser} SMTP_PASSWORD=${!!smtpPass} SMTP_FROM_EMAIL=${!!smtpFromEmail}`
      )
      return res.status(500).json({
        success: false,
        message: "Email service is not configured. Please contact support.",
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
      logger.error(
        `SMTP resend failed for ${email}: ` +
          `code=${smtpError.code} ` +
          `responseCode=${smtpError.responseCode} ` +
          `command=${smtpError.command} ` +
          `message=${smtpError.message}`
      )

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
        message: "Failed to resend verification code. Please try again.",
      })
    }

    logger.info(`OTP resent successfully to ${email}`)

    return res.status(200).json({
      success: true,
      message: "New verification code sent to your email",
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error: any) {
    logger.error(`OTP resend error: ${error.message}`)

    if (error.message.includes("wait") || error.message.includes("limit")) {
      return res.status(429).json({
        success: false,
        message: error.message,
      })
    }

    return res.status(500).json({
      success: false,
      message: "Failed to resend verification code. Please try again.",
    })
  }
}
