import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * POST /store/customer/change-password
 * Body: { old_password: string, new_password: string }
 *
 * For a logged-in customer. Medusa's /auth/customer/emailpass/update only
 * accepts password-reset tokens, not login sessions, so the account page
 * needs its own route: check the current password, then set the new one.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { old_password, new_password } = (req.body ?? {}) as {
    old_password?: string
    new_password?: string
  }

  if (!old_password || !new_password) {
    return res.status(400).json({ success: false, message: "Current and new password are required" })
  }
  if (new_password.length < 8) {
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters" })
  }

  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ success: false, message: "Please log in again" })
  }

  const customer = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(customerId)
  const auth = req.scope.resolve(Modules.AUTH)

  const check = await auth.authenticate("emailpass", {
    body: { email: customer.email, password: old_password },
  } as any)
  if (!check.success) {
    return res.status(400).json({ success: false, message: "Current password is incorrect" })
  }

  const update = await auth.updateProvider("emailpass", {
    entity_id: customer.email,
    password: new_password,
  })
  if (!update.success) {
    return res.status(400).json({ success: false, message: update.error || "Could not update password" })
  }

  return res.status(200).json({ success: true })
}
