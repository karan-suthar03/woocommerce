import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import { Logger } from "@medusajs/framework/types"

type InjectedDependencies = {
  logger: Logger
  storeSettingsModule?: any
}

interface SmtpOptions {
  host: string
  port: number
  secure?: boolean
  auth: {
    user: string
    pass: string
  }
  from: {
    email: string
    name: string
  }
}

class SmtpNotificationService extends AbstractNotificationProviderService {
  static identifier = "smtp"
  protected transporter_: Transporter | null = null
  protected options_: SmtpOptions
  protected logger_: Logger
  protected storeSettingsModule_: any

  constructor(container: InjectedDependencies, options: SmtpOptions) {
    super()
    
    this.options_ = options
    this.logger_ = container.logger
    this.storeSettingsModule_ = container.storeSettingsModule

    // Initialize transporter with default options (will be overridden when sending)
    this.initializeTransporter(options)

    this.logger_.info("✅ SMTP Notification Provider initialized successfully")
  }

  private initializeTransporter(options: SmtpOptions) {
    try {
      this.transporter_ = nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure || false,
        auth: {
          user: options.auth.user,
          pass: options.auth.pass,
        },
      })
    } catch (error: any) {
      this.logger_.error(`Failed to initialize SMTP transporter: ${error.message}`)
    }
  }

  private async getSmtpConfig(): Promise<SmtpOptions> {
    // Try to get settings from store-settings module first
    if (this.storeSettingsModule_) {
      try {
        const host = await this.storeSettingsModule_.getSetting("smtp.host", true)
        const port = await this.storeSettingsModule_.getSetting("smtp.port", true)
        const user = await this.storeSettingsModule_.getSetting("smtp.user", true)
        const password = await this.storeSettingsModule_.getSetting("smtp.password", true)
        const fromEmail = await this.storeSettingsModule_.getSetting("smtp.from_email", true)
        const fromName = await this.storeSettingsModule_.getSetting("smtp.from_name", true)

        // If all required settings are available, use them
        if (host && user && password) {
          return {
            host,
            port: parseInt(port || "587"),
            secure: false,
            auth: {
              user,
              pass: password,
            },
            from: {
              email: fromEmail || user,
              name: fromName || "Store",
            },
          }
        }
      } catch (error) {
        this.logger_.warn("Failed to load SMTP settings from store-settings, using defaults")
      }
    }

    // Fallback to options passed during initialization (from env vars)
    return this.options_
  }

  async send(notification: {
    to: string
    subject?: string
    body?: string
    data?: any
    template?: string
    from?: string | null
  }): Promise<any> {
    try {
      // Get current SMTP configuration (from store-settings or defaults)
      const config = await this.getSmtpConfig()

      // Reinitialize transporter with current config
      this.initializeTransporter(config)

      if (!this.transporter_) {
        throw new Error("SMTP transporter not initialized")
      }

      const mailOptions = {
        from: `${config.from.name} <${config.from.email}>`,
        to: notification.to,
        subject: notification.subject || "Notification from Swami Om Enterprises",
        html: notification.body || this.formatNotificationData(notification.data),
        text: notification.body || JSON.stringify(notification.data),
      }

      const result = await this.transporter_.sendMail(mailOptions)
      
      this.logger_.info(`📧 Email sent successfully to ${notification.to}`)
      
      return {
        id: result.messageId,
        to: notification.to,
        status: "sent",
      }
    } catch (error: any) {
      this.logger_.error(`❌ Failed to send email: ${error.message}`)
      throw error
    }
  }

  private formatNotificationData(data: any): string {
    if (!data) return ""
    
    // Basic HTML formatting for notification data
    let html = "<div style='font-family: Arial, sans-serif; padding: 20px;'>"
    
    if (data.order) {
      html += `<h2 style='color: #333;'>Order Confirmation</h2>`
      html += `<p>Order ID: <strong>${data.order.id || data.order_id}</strong></p>`
      html += `<p>Thank you for your order from Swami Om Enterprises!</p>`
      html += `<p style='color: #666; font-size: 12px; margin-top: 30px;'>If you have any questions, please contact us.</p>`
    } else {
      html += `<pre style='background: #f5f5f5; padding: 15px; border-radius: 5px;'>${JSON.stringify(data, null, 2)}</pre>`
    }
    
    html += "</div>"
    return html
  }
}

export default SmtpNotificationService
