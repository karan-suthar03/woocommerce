import { authenticate, defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import multer from "multer"
import { singleUseResetToken } from "../lib/password-reset"

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
