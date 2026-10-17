// Loaded with NODE_OPTIONS=--require so the Razorpay SDK talks to the local
// mock instead of api.razorpay.com. Dev-only; nothing in the repo changes.
const path = require('path');
const MOCK = process.env.RAZORPAY_MOCK_URL || 'http://localhost:8790';
try {
  const apiPath = path.join('D:/personal/woocommerce/medusa-backend/node_modules/razorpay/dist/api.js');
  const API = require(apiPath);
  const original = API.prototype._createConfig;
  API.prototype._createConfig = function (options) {
    return original.call(this, { ...options, hostUrl: MOCK });
  };
  if (!process.env.__RZP_MOCK_ANNOUNCED) {
    process.env.__RZP_MOCK_ANNOUNCED = '1';
    console.log(`[rzp-mock] Razorpay SDK redirected to ${MOCK}`);
  }
} catch (err) {
  console.error('[rzp-mock] preload failed:', err.message);
}
