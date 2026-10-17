import { authenticate, defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import multer from "multer"
import { singleUseResetToken } from "../lib/password-reset"
import { OTP_VERIFICATION_MODULE } from "../modules/otp-verification"

// Sign-up must have passed the email OTP. The storefront used to check this
// only in the browser, so POST /store/customers could be called directly.
const requireVerifiedEmail = async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  const email = String((req.body as any)?.email ?? "").toLowerCase().trim()
  const token = req.headers["x-verification-token"]
  const otpService = req.scope.resolve(OTP_VERIFICATION_MODULE) as any
  const verified =
    !!email && typeof token === "string" && (await otpService.isEmailVerified(email, token))
  if (!verified) {
    return res.status(403).json({
      type: "not_allowed",
      message: "Email verification required. Please verify your email with the code we sent.",
    })
  }
  next()
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max limit
  },
})

const logoUploadMiddleware = (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
  upload.single("file")(req as any, res as any, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "File size is too large. Please upload an image smaller than 5 MB.",
        })
      }
      return res.status(400).json({
        message: err.message || "Failed to process uploaded file",
      })
    }
    next()
  })
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/store-settings/logo",
      method: ["POST"],
      middlewares: [logoUploadMiddleware],
    },
    {
      matcher: "/admin/media",
      method: ["POST"],
      middlewares: [logoUploadMiddleware],
    },
    {
      matcher: "/store/customers",
      method: ["POST"],
      middlewares: [requireVerifiedEmail],
    },
    {
      matcher: "/store/customer/change-password",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/auth/customer/emailpass/update",
      method: ["POST"],
      middlewares: [singleUseResetToken],
    },
  ],
})
