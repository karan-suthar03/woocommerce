import crypto from "crypto"
import jwt from "jsonwebtoken"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * A short fingerprint of the customer's current password hash.
 *
 * It goes into every reset token, and the update endpoint only accepts a
 * token whose fingerprint still matches. Changing the password changes the
 * hash, so each reset link works once — without storing used tokens anywhere.
 */
export async function passwordFingerprint(
  container: MedusaRequest["scope"],
  email: string
): Promise<string | null> {
  const auth = container.resolve(Modules.AUTH)
  const [identity] = await auth.listProviderIdentities({
    entity_id: email,
    provider: "emailpass",
  })
  const hash = (identity?.provider_metadata as Record<string, unknown> | undefined)?.password
  if (!hash) {
    return null
  }
  return crypto.createHash("sha256").update(String(hash)).digest("hex").slice(0, 16)
}

/**
 * Guards POST /auth/customer/emailpass/update: rejects reset tokens that have
 * already been used (fingerprint no longer matches) or carry none at all.
 * Tokens that fail signature or expiry checks are left for Medusa to reject.
 */
export async function singleUseResetToken(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "")
  const jwtSecret = (req.scope.resolve("configModule") as any)?.projectConfig?.http?.jwtSecret
  if (!token || !jwtSecret) {
    return next()
  }

  let payload: { entity_id?: string; pwv?: string }
  try {
    payload = jwt.verify(token, jwtSecret) as typeof payload
  } catch {
    return next()
  }

  const current = payload.entity_id
    ? await passwordFingerprint(req.scope, payload.entity_id)
    : null
  if (!payload.pwv || payload.pwv !== current) {
    return res.status(401).json({
      type: "unauthorized",
      message: "This password reset link has already been used or is no longer valid. Please request a new one.",
    })
  }
  next()
}
