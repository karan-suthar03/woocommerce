# Session handoff – Swami Om Enterprises (read this first)

Everything needed to continue the work in a new session. Last updated 17 Oct 2026.
Detailed issue list with root causes: **`Docs/PART1_FIX_LOG.md`** (31 items). The brief: `C:\Users\KaranSuthar\Downloads\Project_Brief_SwamiOm_and_GiftCabin.pdf` (Part 1 = audit/fix this site, Part 2 = GiftCabin clone, not started).

No secrets are in this file. Where they live: Razorpay test keys → `Downloads\rzp-key (3).csv` and both `.env.local` files; server secrets → server `.env` files; admin login → ask the owner.

---

## 1. The project

| Part | Path | Notes |
|---|---|---|
| Backend + admin | `medusa-backend/apps/backend` | Medusa **2.15.3**, monorepo root `medusa-backend` (turbo, npm workspaces) |
| Storefront | `solace-medusa-starter` | Next.js **16.2**, React 19, port 8000 |
| Razorpay | `medusa-plugin-razorpay-v2@0.1.4` + **`medusa-backend/patches/medusa-plugin-razorpay-v2+0.1.4.patch`** | All plugin fixes live in this patch (patch-package) |
| Docs | `Docs/` | `PART1_FIX_LOG.md`, this file |
| Test tools | `tools/` | Razorpay mock + browser helpers (see §6) |

Custom backend code worth knowing: `src/api/store/custom/razorpay-verify` (signature check), `src/api/store/customer/forgot-password` + `src/lib/password-reset.ts` (single-use reset tokens), `src/api/store/customer/change-password`, `src/api/middlewares.ts` (OTP enforcement on sign-up, reset-token guard), `src/jobs/refund-orphaned-razorpay-payments.ts` (auto-refund paid-but-no-order), `src/subscribers/order-placed.ts` (order emails), `src/modules/{otp-verification,store-settings,smtp-notification}`.
Storefront: `src/lib/data/catalog-fetch.ts` (the only working cache path – see fix #30), `src/lib/data/cart.ts` (`placeOrder`, `getUnavailableCartItems`), `src/modules/checkout/components/payment-button/razorpay-payment-button.tsx`, `src/proxy.ts` (middleware).

## 2. Environments

### Local (this PC)
- Backend `cd medusa-backend/apps/backend && npm run dev` → :9000 (admin :9000/app). Storefront `cd solace-medusa-starter && npm run dev` → :8000.
- **⚠ Local `.env.local` points at the LIVE production database** (`66.116.232.174/swami_samarth`). Every local test order/upload lands in live data, and local admin uploads write `http://localhost:9000/static/...` URLs into live products. Recommended: own local DB (see `.env.example`). Not changed yet – owner decision.
- Local `.env.local` files now hold the **new valid test keys** (`rzp_test_TovN…`). Old files backed up in the old session's scratchpad (gone) – not needed.
- Backend loads `.env`, then `.env.local` **with override** – blank values in `.env.local` wipe anything you export in the shell (use other var names to inject, see `tools/`).

### Production server
- `ssh external-server` (key auth, `~/.ssh/config` alias → root@66.116.232.174). Shared root login – **owner's rule: confirm before changing production**; read-only checks are fine.
- Same box runs storefront, backend, Postgres (127.0.0.1:5432, port also open to the internet – open item #13), Redis, nginx, and another project (`tripigo`) sharing the **2 CPUs**.
- Repo: `/var/www/self` – currently on local branch **`deploy-20261017` @ `cad06e9` (latest `fix/payment-success-error`)** (fork: github.com/karan-suthar03/woocommerce, PR into tejas1112001 `main`). Old server edits are in `git stash` ("pre-deploy-20261017 local edits").
- pm2: `swami-backend` (cwd `medusa-backend/apps/backend/.medusa/server`, `npm run start`), `swami-frontend` (cwd `solace-medusa-starter`, `npm run start`). Logs: `pm2 jlist` → `pm_out_log_path`.
- Domains: `swamiomenterprises.in` → storefront, `api.swamiomenterprises.in` → backend.
- Env files: backend **source** `medusa-backend/apps/backend/.env` – `npm run build` **copies it over** `.medusa/server/.env` (edit both or the source). Storefront `solace-medusa-starter/.env.production` (NEXT_PUBLIC_* are baked at build → rebuild).
- Current Razorpay state on live: **TEST MODE**. Backend env has an appended `RAZORPAY_TEST_*` block (test key, secret, webhook secret `SwamiWebhook_Test_…`); live `RAZORPAY_ID rzp_live_TYjI…` returns 401 (dead). `RAZORPAY_MODE` unset → test. Storefront public key = test key. Also added: `STOREFRONT_URL`, `REVALIDATE_SECRET` (shared with storefront).
- Razorpay webhook (test mode, set up by Tejas): `https://api.swamiomenterprises.in/hooks/payment/razorpay_razorpay`, events payment.authorized/captured/failed, order.paid, refund.created/processed/failed.

### Backups on the server
| What | Where |
|---|---|
| Before test keys | `.medusa/server/.env.pre-testkeys-20261017-100333`, `solace-medusa-starter/.env.production.pre-testkeys-20261017-100333` |
| Before full deploy (commit `e2ab172`, env files, server diff) | `/root/deploy-backup-20261017-110208/` |
| Env before STOREFRONT_URL/REVALIDATE_SECRET | `/root/env-backup-20261017-114325/` |
| Plugin file/patch before each patch deploy | `/root/rzp-patch.bak-*`, `/root/razorpay-base.js.bak-*` |
| pm2 process list | `/root/pm2-dump.bak-*` |

## 3. Git state
- Local branch **`fix/payment-success-error`**, ~20 commits ahead of `main`, **not pushed** (remote `origin` = github.com/tejas1112001/woocommerce). Pending owner decision: push + PR into `main` so GitHub matches the server.
- Server runs the same commits (bundled over SSH, see §4).

## 4. How to deploy (what was used all session)
```bash
# local: bundle commits the server doesn't have yet (check server HEAD first: `git rev-parse --short HEAD`; commits were rewritten 17 Oct, old 289b5c6 = 8f65362)
git bundle create /tmp/d.bundle <server-HEAD>..HEAD
scp /tmp/d.bundle external-server:/tmp/d.bundle
ssh external-server
cd /var/www/self
# ONLY if medusa-backend/patches/* changed: undo the old patch BEFORE switching code
(cd medusa-backend && npx patch-package --reverse)
git -c user.name=deploy -c user.email=deploy@localhost fetch /tmp/d.bundle HEAD
git -c user.name=deploy -c user.email=deploy@localhost checkout -B deploy-20261017 FETCH_HEAD
(cd medusa-backend && npx patch-package)          # apply (no package name! with a name it CREATES a patch)
bash /tmp/deploy.sh                               # builds backend + storefront, restarts both (script is on the server)
# backend-only: cd medusa-backend/apps/backend && npm run build && pm2 restart swami-backend
# storefront-only: cd solace-medusa-starter && npm run build && pm2 restart swami-frontend
```
Checks after deploy: `curl localhost:9000/health`; grep `RAZORPAY_TEST_KEY_ID` in `.medusa/server/.env`; a payment session POST returns 200.
Rollback: `git checkout e2ab172` (original) or an earlier commit, restore env files from the backups above, rebuild, `pm2 restart all`.
**Go-live with real money:** valid live keys in `RAZORPAY_ID/SECRET`, live-mode webhook + `RAZORPAY_WEBHOOK_SECRET`, set `RAZORPAY_MODE=live`, storefront `NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_…`, rebuild both. Startup fails on key/mode mismatch (by design).

## 5. Status of the brief (Part 1)
| § | Topic | Status |
|---|---|---|
| 1 | Study / notes | Done (this file) |
| 2 | Paid-but-error bug | Root causes found and fixed: dead live keys (#1), capture crash (#2), sold-out-after-payment → auto-refund job + pre-pay stock check (#24). Webhook vs callback race verified safe (one order) |
| 3 | Razorpay test mode, webhooks, signature | Done in test mode on live; live mode needs owner keys |
| 4 | Env vars | `.env.example` rewritten (#28); live config bugs fixed (#25, #26) |
| 5 | Performance / load | Caching fix: product page 1.6→9.5 req/s (#30); load-test numbers in fix log |
| 6 | Stock | Overselling blocked (tested); Topi/Napkins have inventory off (#29, owner) |
| 7 | Variants | T-shirt correct (32 variants, own SKU/price/stock); Napkins no SKU |
| 8 | Customer dashboard | Paid shown as unpaid – fixed (#31); refund lines (#16) |
| 9 | Refunds | Admin full/partial refunds work (#15); refund status webhooks logged (#17) |
| 10 | Auth / forgot password | Single-use links, no enumeration, change-password fixed, OTP enforced (#9, #18–#21) |
| 11 | Other bugs | See fix log |

**Still open (all need the owner):** #11/#22 real support email (`support@solace-store.com` placeholder in settings), #12 separate local DB, #13 rotate leaked passwords/keys + firewall Postgres, #27 email deliverability (OTP/reset mails land in spam – send from a domain address with SPF/DKIM), #29 Topi/Napkins stock + SKU, live Razorpay keys, push/PR. Part 2 (GiftCabin) not started.

## 6. Test tooling (in `tools/`)
- **Razorpay mock** `tools/razorpay-mock/server.mjs` (port 8790) – fake Razorpay API + signed webhooks with chosen delay. Start backend with `NODE_OPTIONS=--require <path>\tools\razorpay-mock\preload.cjs` (redirects the SDK to the mock; run from **PowerShell** – Git-Bash short paths break npx). In the browser, run `install-popup.js` on the checkout page to replace the Razorpay popup; `window.__rzpMock = {webhook_delay_ms, handler_delay_ms}` sets the race. Signatures use the real secrets from the backend `.env.local`.
- **Browser control**: Claude side-panel extension server `D:\projects\claude-extention` (`node server.js`, port 8788, now uses the claude2 account `~/.claude-alt`; start with `WORKDIR=D:\personal\woocommerce`). `node bin/page.mjs <cmd>` drives the active tab. Two Chrome profiles poll the server, so commands randomly hit the wrong one → use `tools/browser/pg.mjs` (retries, targets a tab id – update `TAB`; get ids with `node bin/page.mjs tabs`). `node pg.mjs js file.js` evaluates a file (expression only, no top-level `;`-separated statements).
- `tools/browser/perf.js` – page performance summary; `tools/browser/oversell.mjs` – last-unit race test (needs mock + local backend).
- Load test: `npx -y autocannon@7 -c 10 -d 15 <url>` (keep it small – shared live server).
- Gmail connector can read the owner's inbox (allowed). `+alias` test mails from the live server go to **Spam** (connector can't see Spam).
- Real Razorpay test cards: Mastercard `5267 3181 8797 5449` / Visa `4718 6091 0820 4366`, any future expiry/CVV, mobile e.g. `8291734650` (fake-looking numbers are rejected), then "Success".

## 7. Test data left on the live database
- Customers: `claude.test+checkout@example.com`, `karan.suthar.lakha+swamitest@gmail.com`, `otp-test-…@example.com`, guest `oversell1/2@example.com` carts.
- Orders: #17 (test payment, captured, ₹150 refunded), #18 and #19 cancelled.
- Test product: image replaced with `…/static/1792233447871-upload-test.png` (original was a broken localhost URL), stock back to 97.
- Store setting `store.brand_name` changed "Solace E-Commerce Store" → "Swami Om Enterprises".
- Several abandoned carts / payment collections.

## 8. Gotchas learned the hard way
- `sdk.store.*.list(query, X)` – X is **headers**, not fetch options. Caching must go through `sdk.client.fetch` (`catalogFetch`).
- `npx patch-package <name>` **creates** a patch from node_modules; `npx patch-package` (no args) **applies**. Patches assume a pristine package – reverse the old patch before applying a new one.
- Medusa calls the provider's `refundPayment` without currency; captured collections report status `completed`; `/auth/customer/emailpass/update` only accepts reset tokens (needs `entity_id`), never login sessions.
- Medusa holds webhooks 5 s before processing; Razorpay auto-capture means money is taken before the order exists.
- Next.js public env vars need a rebuild; a build replaces files under a running server (restart right after).
- Windows: PowerShell 5.1 shows UTF-8 files as mojibake (files are fine); CRLF breaks multi-line sed/regex edits – use the Edit tool.

## 9. Suggested next steps
1. Owner decisions in §5 "Still open" (live keys, support email, push/PR, passwords).
2. Push `fix/payment-success-error` and open a PR into `main`.
3. Separate local database; then Part 2 (GiftCabin) per the brief.
