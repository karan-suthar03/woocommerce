import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import crypto from "crypto";

/**
 * POST /store/custom/razorpay-verify
 *
 * Verifies a Razorpay payment signature before the frontend calls placeOrder().
 *
 * WHY THIS EXISTS:
 * Razorpay's success handler fires on the frontend with three values:
 *   razorpay_payment_id, razorpay_order_id, razorpay_signature
 * The signature is an HMAC-SHA256 of "<order_id>|<payment_id>" using the
 * key_secret. Without verifying this before calling cart.complete(), a
 * malicious actor could forge a success callback and place an unpaid order.
 *
 * This endpoint:
 *  1. Reads the key_secret from environment variables (never exposed to browser)
 *  2. Recomputes the expected signature
 *  3. Compares using crypto.timingSafeEqual to prevent timing attacks
 *  4. Returns { verified: true } or 400 with an error
 *
 * The frontend calls this endpoint in the Razorpay success handler BEFORE
 * calling placeOrder(). If verification fails, placeOrder() is never called.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
      req.body as {
        razorpay_payment_id?: string;
        razorpay_order_id?: string;
        razorpay_signature?: string;
      };

    // --- Input validation ---
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        verified: false,
        error:
          "Missing required fields: razorpay_payment_id, razorpay_order_id, razorpay_signature",
      });
    }

    // --- Retrieve the key secret (server-side only) ---
    // Same mode rule as medusa-config.ts: the secret must belong to the key
    // set that created the Razorpay order, or every signature fails.
    let keySecret =
      process.env.RAZORPAY_MODE === "live"
        ? process.env.RAZORPAY_SECRET
        : process.env.RAZORPAY_TEST_KEY_SECRET;

    if (keySecret) {
      keySecret = keySecret.trim();
    }

    if (!keySecret) {
      console.error(
        "[razorpay-verify] Razorpay key secret for the current RAZORPAY_MODE is not set"
      );
      return res.status(500).json({
        verified: false,
        error: "Payment verification service is not configured.",
      });
    }

    // --- Compute expected signature ---
    // Razorpay signs: "<razorpay_order_id>|<razorpay_payment_id>"
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    // --- Timing-safe comparison to prevent timing attacks ---
    const signatureBuffer = Buffer.from(razorpay_signature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");

    if (signatureBuffer.length !== expectedBuffer.length) {
      console.warn(
        "[razorpay-verify] Signature length mismatch — possible tampered request",
        {
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
          timestamp: new Date().toISOString(),
        }
      );
      return res.status(400).json({
        verified: false,
        error: "Payment signature verification failed.",
      });
    }

    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      console.warn("[razorpay-verify] Invalid signature — possible fraud", {
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
        timestamp: new Date().toISOString(),
      });
      return res.status(400).json({
        verified: false,
        error: "Payment signature verification failed.",
      });
    }

    // --- Verification passed ---
    console.log("[razorpay-verify] Payment verified successfully", {
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ verified: true });
  } catch (err: any) {
    console.error("[razorpay-verify] Unexpected error:", err);
    return res.status(500).json({
      verified: false,
      error: "An unexpected error occurred during payment verification.",
    });
  }
}
