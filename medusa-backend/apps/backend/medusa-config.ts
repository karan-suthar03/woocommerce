import {
  loadEnv,
  defineConfig,
  Modules,
  ContainerRegistrationKeys,
} from '@medusajs/framework/utils'
import { existsSync } from 'fs'
import { resolve } from 'path'
import dotenv from 'dotenv'

const nodeEnv = process.env.NODE_ENV || 'development'
loadEnv(nodeEnv, process.cwd())

const localEnvPath = resolve(process.cwd(), '.env.local')
if (nodeEnv !== 'production' && existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true })
}

const productionEnvPath = resolve(process.cwd(), '.env.production')
if (nodeEnv === 'production' && existsSync(productionEnvPath)) {
  dotenv.config({ path: productionEnvPath, override: true })
}

const jwtSecret = process.env.JWT_SECRET
const cookieSecret = process.env.COOKIE_SECRET

if (nodeEnv === "production") {
  const isInsecure = (s?: string) => !s || s === "supersecret" || s.length < 32
  if (isInsecure(jwtSecret) || isInsecure(cookieSecret)) {
    throw new Error(
      "[CRITICAL SECURITY ERROR] In production, JWT_SECRET and COOKIE_SECRET must be set to unique, " +
      "cryptographically strong strings with a minimum length of 32 characters. " +
      "Do not use default placeholder secrets."
    )
  }
}

// RAZORPAY_MODE picks the key set explicitly ("live" or "test", default
// "test"), so leftover RAZORPAY_TEST_* values can never silently override
// live keys. The storefront's NEXT_PUBLIC_RAZORPAY_KEY_ID must be the same mode.
const razorpayLive = process.env.RAZORPAY_MODE === "live"
const razorpay = razorpayLive
  ? {
      key_id: process.env.RAZORPAY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
      account: process.env.RAZORPAY_ACCOUNT || undefined,
      automatic_expiry_period: process.env.RAZORPAY_AUTO_EXPIRY_PERIOD,
      manual_expiry_period: process.env.RAZORPAY_MANUAL_EXPIRY_PERIOD,
      webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET || undefined,
    }
  : {
      key_id: process.env.RAZORPAY_TEST_KEY_ID,
      key_secret: process.env.RAZORPAY_TEST_KEY_SECRET,
      account: process.env.RAZORPAY_TEST_ACCOUNT || undefined,
      automatic_expiry_period: process.env.RAZORPAY_TEST_AUTO_EXPIRY_PERIOD,
      manual_expiry_period: process.env.RAZORPAY_TEST_MANUAL_EXPIRY_PERIOD,
      webhook_secret: process.env.RAZORPAY_TEST_WEBHOOK_SECRET || undefined,
    }

if (razorpay.key_id && !razorpay.key_id.startsWith(razorpayLive ? "rzp_live_" : "rzp_test_")) {
  throw new Error(
    `RAZORPAY_MODE is "${razorpayLive ? "live" : "test"}" but the configured key is ${razorpay.key_id.slice(0, 9)}… — keys and mode must match.`
  )
}

const isRedisConfigured = Boolean(
  process.env.REDIS_URL && process.env.REDIS_URL.trim() !== ""
)

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      connection: {
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      } as any,
      pool: {
        min: 2,
        max: 30,
        idleTimeoutMillis: 15000,
        acquireTimeoutMillis: 30000,
      },
    },
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: jwtSecret || "supersecret",
      cookieSecret: cookieSecret || "supersecret",
    }
  },
  plugins: [],
  modules: [
    ...(isRedisConfigured
      ? [
          {
            resolve: "@medusajs/medusa/event-bus-redis",
            options: {
              redisUrl: process.env.REDIS_URL,
            },
          },
          {
            resolve: "@medusajs/medusa/workflow-engine-redis",
            options: {
              redis: {
                url: process.env.REDIS_URL,
              },
            },
          },
          {
            resolve: "@medusajs/medusa/locking",
            options: {
              providers: [
                {
                  resolve: "@medusajs/locking-redis",
                  id: "locking-redis",
                  options: {
                    redisUrl: process.env.REDIS_URL,
                  },
                },
              ],
            },
          },
        ]
      : []),
    {
      resolve: "./src/modules/store-settings",
    },
    {
      resolve: "./src/modules/otp-verification",
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              backend_url: `${process.env.BACKEND_URL}/static`,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      dependencies: [Modules.PAYMENT, ContainerRegistrationKeys.LOGGER],
      options: {
        providers: [
          {
            resolve:
              "medusa-plugin-razorpay-v2/providers/payment-razorpay/src",
            id: "razorpay",
            options: {
              key_id: razorpay.key_id,
              key_secret: razorpay.key_secret,
              razorpay_account: razorpay.account,
              automatic_expiry_period: razorpay.automatic_expiry_period ?? 30,
              manual_expiry_period: razorpay.manual_expiry_period ?? 7200,
              webhook_secret: razorpay.webhook_secret,
              auto_capture: true,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/smtp-notification",
            id: "smtp",
            options: {
              host: process.env.SMTP_HOST,
              port: parseInt(process.env.SMTP_PORT || "587"),
              secure: false,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              },
              from: {
                email: process.env.SMTP_FROM_EMAIL,
                name: process.env.SMTP_FROM_NAME,
              },
            },
          },
        ],
      },
    },
  ],
})
