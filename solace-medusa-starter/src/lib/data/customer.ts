'use server'

import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { sdk } from '@lib/config'
import { getLocalizedPath } from '@lib/util/urls'

import { getAuthHeaders, removeAuthToken, setAuthToken, removeCartId } from './cookies'

/**
 * Get headers with publishable API key for fetch calls
 */
function getPublishableHeaders(additionalHeaders?: HeadersInit): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  }
  
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (publishableKey) {
    headers['x-publishable-api-key'] = publishableKey
  }
  
  return headers
}

export async function getCustomer() {
  const authHeaders = await getAuthHeaders()

  // No-op if not authenticated
  if (!('authorization' in authHeaders)) {
    return null
  }

  return await sdk.store.customer
    .retrieve({}, { next: { tags: ['customer'] }, ...authHeaders })
    .then(({ customer }) => customer)
    .catch(() => null)
}

export async function updateCustomer(
  _currentState: {
    success: boolean
    error: string | null
  },
  formData: FormData
) {
  const authHeaders = await getAuthHeaders()

  const body = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    phone: formData.get('phone') as string,
  }

  return await sdk.store.customer
    .update(body, {}, authHeaders)
    .then(() => {
      revalidateTag('customer', 'max')
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export async function signup(
  _currentState: unknown,
  formData: FormData
): Promise<string | null> {
  // Normalise email — the OTP token was generated with the lowercase email,
  // and Medusa's auth layer also normalises internally.  Using the raw form
  // value (which can have mixed case) caused token validation to fail and
  // sdk.auth.register() to surface "Identity with email already exists" even
  // for genuinely new users who typed their email in a different case.
  const email = (formData.get('email') as string).toLowerCase().trim()
  const password = formData.get('password') as string
  const verificationToken = formData.get('verification_token') as string
  
  // Verify OTP token is present
  if (!verificationToken) {
    return "Email verification required. Please verify your email first."
  }

  // Validate verification token
  try {
    const decoded = JSON.parse(
      Buffer.from(verificationToken, 'base64').toString('utf-8')
    )
    
    // Compare against the normalised email — both sides are lowercase.
    if (decoded.email !== email || !decoded.verified) {
      return "Invalid verification. Please try registering again."
    }
    
    // Check if verification is recent (within 1 hour)
    const tokenAge = Date.now() - decoded.timestamp
    const oneHour = 60 * 60 * 1000
    if (tokenAge > oneHour) {
      return "Verification expired. Please register again."
    }
  } catch {
    return "Invalid verification token."
  }

  const customerForm = {
    // Always use the normalised email so it is consistent with the auth identity.
    email,
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    phone: formData.get('phone') as string,
  }

  // `redirectTo` is an optional hidden field injected by the checkout guard so
  // newly registered customers land on the checkout page they came from instead
  // of the generic /account dashboard.
  // Always decode — the proxy uses searchParams.set() which auto-encodes, and the
  // server-side guard uses manual string concat + encodeURIComponent; decodeURIComponent
  // is safe to call on an already-decoded path (no-op).
  const rawRedirectTo = (formData.get('redirectTo') as string) || null
  const redirectTo = rawRedirectTo ? decodeURIComponent(rawRedirectTo) : null

  try {
    const token = await sdk.auth.register('customer', 'emailpass', {
      email: customerForm.email,
      password: password,
    })

    // The backend re-checks the email OTP from this header before creating the customer.
    const customHeaders = {
      authorization: `Bearer ${token}`,
      'x-verification-token': verificationToken,
    }

    await sdk.store.customer.create(customerForm, {}, customHeaders)

    const loginToken = await sdk.auth.login('customer', 'emailpass', {
      email: customerForm.email,
      password,
    })

    await setAuthToken(loginToken as string)
    revalidateTag('customer', 'max')
  } catch (error: any) {
    const message: string = error?.message ?? error?.toString() ?? 'Unknown error'
    // Tag known "email already taken" errors with a structured prefix so the
    // frontend can render a friendly recovery UI without fragile substring checks
    // on Medusa's internal error strings (which can change between versions).
    if (
      message.toLowerCase().includes('identity with email') ||
      message.toLowerCase().includes('already exists')
    ) {
      return `EMAIL_EXISTS:${email}`
    }
    return message
  }

  // If the user came from a protected page (e.g. checkout), send them back there.
  redirect(redirectTo ?? '/account')
}

export async function forgotPassword(
  _currentState: unknown,
  formData: FormData
): Promise<string | null> {
  const rawEmail = formData.get('email') as string
  const email = (rawEmail || '').toLowerCase().trim()

  if (!email) {
    return 'Please enter your email address.'
  }

  try {
    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
    const res = await fetch(`${backendUrl}/store/customer/forgot-password`, {
      method: 'POST',
      headers: getPublishableHeaders(),
      body: JSON.stringify({ email }),
      cache: 'no-store',
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data.success) {
      if (res.status === 404 || data.message === 'ACCOUNT_NOT_FOUND') {
        return 'ACCOUNT_NOT_FOUND'
      }
      return data.message || 'Failed to send password reset email'
    }

    return 'SUCCESS'
  } catch (error: any) {
    return error?.message ?? error?.toString() ?? 'Failed to send password reset email'
  }
}

export async function resetPassword(
  _currentState: unknown,
  formData: FormData
): Promise<string | null> {
  const token = formData.get('token') as string
  const password = formData.get('new_password') as string

  if (!password || !token) {
    return 'Invalid reset request. Please request a new password reset link.'
  }

  try {
    await sdk.auth.updateProvider('customer', 'emailpass', { password }, token)
    return null
  } catch (error: any) {
    const message = error?.message ?? error?.toString() ?? 'Failed to reset password'
    return message
  }
}

export async function login(
  _currentState: unknown,
  formData: FormData
): Promise<string | null> {
  const email = (formData.get('email') as string || '').toLowerCase().trim()
  const password = formData.get('password') as string

  // `redirectTo` is an optional hidden field injected by the checkout guard so
  // authenticated users land back on the page they were trying to reach instead
  // of the generic /account dashboard.
  const rawRedirectTo = (formData.get('redirectTo') as string) || null
  const redirectTo = rawRedirectTo ? decodeURIComponent(rawRedirectTo) : null

  if (!email || !password) {
    return 'Please enter both email and password.'
  }

  // 1. Check if email is registered in customer database
  try {
    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
    const checkRes = await fetch(
      `${backendUrl}/store/customer/check-email?email=${encodeURIComponent(email)}`,
      {
        headers: getPublishableHeaders(),
        cache: 'no-store',
      }
    )
    if (checkRes.ok) {
      const data = await checkRes.json()
      if (data.exists === false) {
        return 'ACCOUNT_NOT_FOUND'
      }
    }
  } catch {
    // Silently fall through to auth login attempt if check fetch fails
  }

  // 2. Attempt authentication
  try {
    const token = await sdk.auth.login('customer', 'emailpass', {
      email,
      password,
    })
    await setAuthToken(token as string)
    revalidateTag('customer', 'max')
  } catch (error: any) {
    const errStr = (error?.message ?? error?.toString() ?? '').toLowerCase()
    if (
      errStr.includes('not found') ||
      errStr.includes('does not exist') ||
      errStr.includes('no identity')
    ) {
      return 'ACCOUNT_NOT_FOUND'
    }
    return 'INCORRECT_PASSWORD'
  }

  // Redirect happens outside try/catch so it throws the redirect signal correctly.
  redirect(redirectTo ?? '/account')
}

export async function updateCustomerPassword(
  _currentState: { success: boolean; error: string | null },
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const old_password = formData.get('old_password') as string
  const new_password = formData.get('new_password') as string
  const confirm_password = formData.get('confirm_password') as string

  if (new_password !== confirm_password) {
    return { success: false, error: 'New passwords do not match' }
  }

  if (new_password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' }
  }

  try {
    // /auth/customer/emailpass/update only accepts reset tokens, so a logged-in
    // change goes through the backend route, which checks the current password.
    const authHeaders = await getAuthHeaders()
    const token = (authHeaders as any)['authorization']?.replace('Bearer ', '')

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL}/store/customer/change-password`,
      {
        method: 'POST',
        headers: getPublishableHeaders({
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        }),
        body: JSON.stringify({ old_password, new_password }),
      }
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return {
        success: false,
        error: body?.message ?? 'Failed to update password',
      }
    }

    return { success: true, error: null }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? 'Current password is incorrect',
    }
  }
}

export async function signout(countryCode: string) {
  await sdk.auth.logout()
  await removeAuthToken()
  await removeCartId()
  revalidateTag('auth', 'max')
  revalidateTag('customer', 'max')
  revalidateTag('cart', 'max')
  redirect(getLocalizedPath('/account', countryCode))
}

export const addCustomerAddress = async (
  _currentState: {
    success: boolean
    error: string | null
  },
  formData: FormData
): Promise<any> => {
  const address = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    company: formData.get('company') as string,
    address_1: formData.get('address_1') as string,
    city: formData.get('city') as string,
    postal_code: formData.get('postal_code') as string,
    province: formData.get('province') as string,
    country_code: formData.get('country_code') as string,
    phone: formData.get('phone') as string,
    address_name:
      (formData.get('address_name') as string) ?? 'shipping_address',
    is_default_shipping:
      formData.get('is_default_shipping') === 'on' ||
      formData.get('is_default_shipping') === 'true'
        ? true
        : false,
  }

  const authHeaders = await getAuthHeaders()

  return sdk.store.customer
    .createAddress(address, {}, authHeaders)
    .then(() => {
      revalidateTag('customer', 'max')
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const deleteCustomerAddress = async (
  addressId: string
): Promise<void> => {
  const authHeaders = await getAuthHeaders()

  await sdk.store.customer
    .deleteAddress(addressId, authHeaders)
    .then(() => {
      revalidateTag('customer', 'max')
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const addressId =
    (currentState.addressId as string) ?? (formData.get('id') as string)

  const address = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    company: formData.get('company') as string,
    address_1: formData.get('address_1') as string,
    address_2: formData.get('address_2') as string,
    city: formData.get('city') as string,
    postal_code: formData.get('postal_code') as string,
    province: formData.get('province') as string,
    country_code: formData.get('country_code') as string,
    phone: formData.get('phone') as string,
    is_default_shipping:
      formData.get('is_default_shipping') === 'on' ||
      formData.get('is_default_shipping') === 'true'
        ? true
        : false,
  }

  const authHeaders = await getAuthHeaders()

  return sdk.store.customer
    .updateAddress(addressId, address, {}, authHeaders)
    .then(() => {
      revalidateTag('customer', 'max')
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}
