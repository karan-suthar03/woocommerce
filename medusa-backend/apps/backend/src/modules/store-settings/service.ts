import { MedusaService } from "@medusajs/framework/utils"
import StoreSetting from "./models/store-setting"
import { encrypt, decrypt, maskSecret, isMasked } from "./utils/crypto"
import fs from "fs"
import path from "path"

const FALLBACK_FILE_PATH = path.resolve(process.cwd(), "static", "store-settings-store.json")

interface SettingPayload {
  key: string
  value: string
  is_secret?: boolean
}

interface CacheEntry {
  value: string
  expiresAt: number
}
const settingsCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 1000 // 60 seconds TTL

class StoreSettingsModuleService extends MedusaService({
  StoreSetting,
}) {
  private getCached(key: string): string | null {
    const entry = settingsCache.get(key)
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value
    }
    return null
  }

  private setCached(key: string, value: string) {
    settingsCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  }

  private readFallbackStore(): Record<string, { value: string; is_secret: boolean }> {
    try {
      if (fs.existsSync(FALLBACK_FILE_PATH)) {
        const raw = fs.readFileSync(FALLBACK_FILE_PATH, "utf-8")
        return JSON.parse(raw)
      }
    } catch (e) {
      console.warn("Failed to read fallback store settings file:", e)
    }
    return {}
  }

  private writeFallbackStore(data: Record<string, { value: string; is_secret: boolean }>) {
    try {
      const dir = path.dirname(FALLBACK_FILE_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(FALLBACK_FILE_PATH, JSON.stringify(data, null, 2), "utf-8")
    } catch (e) {
      console.warn("Failed to write fallback store settings file:", e)
    }
  }

  async getSetting(key: string, decryptSecret: boolean = false): Promise<string> {
    const cacheKey = `${key}_${decryptSecret}`
    const cached = this.getCached(cacheKey)
    if (cached !== null) {
      return cached
    }

    // 1. Check DB first
    try {
      const settings = await (this as any).listStoreSettings({ key })
      if (settings && settings.length > 0) {
        const setting = settings[0]
        let val = setting.value
        if (setting.is_secret) {
          val = decryptSecret ? decrypt(setting.value) : maskSecret(decrypt(setting.value))
        }
        this.setCached(cacheKey, val)
        return val
      }
    } catch (err) {
      // Table might not exist yet before migration
    }

    // 2. Check Fallback File
    const fallback = this.readFallbackStore()
    if (fallback[key]) {
      const item = fallback[key]
      let val = item.value
      if (item.is_secret) {
        const raw = decrypt(item.value)
        val = decryptSecret ? raw : maskSecret(raw)
      }
      this.setCached(cacheKey, val)
      return val
    }

    // 3. Environment Variable Defaults
    // SMTP Settings defaults
    if (key === "smtp.host") {
      return process.env.SMTP_HOST || ""
    }
    if (key === "smtp.port") {
      return process.env.SMTP_PORT || "587"
    }
    if (key === "smtp.user") {
      return process.env.SMTP_USER || ""
    }
    if (key === "smtp.password") {
      const pass = process.env.SMTP_PASSWORD || ""
      return decryptSecret ? pass : maskSecret(pass)
    }
    if (key === "smtp.from_email") {
      return process.env.SMTP_FROM_EMAIL || ""
    }
    if (key === "smtp.from_name") {
      return process.env.SMTP_FROM_NAME || ""
    }

    // General Store Setting defaults
    if (key === "store.maintenance_mode") return "false"
    if (key === "store.brand_name") return "Solace E-Commerce Store"
    if (key === "store.support_email") return "support@solace-store.com"
    if (key === "store.logo_url") return ""

    return ""
  }

  async getAllSettings(includeDecryptedSecrets: boolean = false): Promise<Record<string, { value: string; is_secret: boolean; raw_masked?: string }>> {
    const keys = [
      "smtp.host",
      "smtp.port",
      "smtp.user",
      "smtp.password",
      "smtp.from_email",
      "smtp.from_name",
      "store.maintenance_mode",
      "store.brand_name",
      "store.logo_url",
      "store.support_email",
      "store.support_phone",
      "store.default_currency",
    ]

    const secretKeys = new Set(["smtp.password"])
    const result: Record<string, { value: string; is_secret: boolean; raw_masked?: string }> = {}

    for (const key of keys) {
      const isSecret = secretKeys.has(key)
      const val = await this.getSetting(key, includeDecryptedSecrets)
      result[key] = {
        value: val,
        is_secret: isSecret,
      }
    }

    return result
  }

  async setSetting(key: string, value: string, isSecret: boolean = false): Promise<void> {
    // Invalidate cached values on write
    settingsCache.delete(`${key}_true`)
    settingsCache.delete(`${key}_false`)

    let finalValue = value

    // If it's a secret key and the user provided a masked value, don't overwrite with mask
    if (isSecret) {
      if (isMasked(value)) {
        // Skip updating secret if user didn't modify masked string
        return
      }
      finalValue = encrypt(value)
    }

    // 1. Try updating database record
    let dbUpdated = false
    try {
      const existing = await (this as any).listStoreSettings({ key })
      if (existing && existing.length > 0) {
        await (this as any).updateStoreSettings({
          id: existing[0].id,
          value: finalValue,
          is_secret: isSecret,
        })
      } else {
        await (this as any).createStoreSettings({
          key,
          value: finalValue,
          is_secret: isSecret,
        })
      }
      dbUpdated = true
    } catch (err) {
      console.warn(`Could not save setting '${key}' to DB (migration pending), storing in fallback file:`, err)
    }

    // 2. Always sync to fallback file as well for high availability
    const store = this.readFallbackStore()
    store[key] = {
      value: finalValue,
      is_secret: isSecret,
    }
    this.writeFallbackStore(store)
  }
}

export default StoreSettingsModuleService
