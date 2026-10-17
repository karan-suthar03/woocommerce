'use client'

import { useState, useTransition } from 'react'

import { emailRegex } from '@lib/constants'
import { forgotPassword } from '@lib/data/customer'
import { cn } from '@lib/util/cn'
import { LOGIN_VIEW } from '@modules/account/templates/login-template'
import { SubmitButton } from '@modules/checkout/components/submit-button'
import { Box } from '@modules/common/components/box'
import { Button } from '@modules/common/components/button'
import { Heading } from '@modules/common/components/heading'
import { Input } from '@modules/common/components/input'
import { Text } from '@modules/common/components/text'
import { toast } from '@modules/common/components/toast'

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
  /** Accepted for interface consistency with Login/Register */
  redirectTo?: string
}

const ForgotPassword = ({ setCurrentView }: Props) => {
  const [isPending, startTransition] = useTransition()
  const [emailInputError, setEmailInputError] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const rawEmail = (formData.get('email') as string || '').trim()

    if (!rawEmail) {
      setEmailInputError('Please enter your email address.')
      return
    }

    if (!emailRegex.test(rawEmail)) {
      setEmailInputError('Please enter a valid email address.')
      return
    }

    setEmailInputError(null)
    setServerError(null)
    setIsSuccess(false)

    startTransition(async () => {
      const res = await forgotPassword(null, formData)
      if (res === 'ACCOUNT_NOT_FOUND') {
        setServerError('ACCOUNT_NOT_FOUND')
        toast('error', 'No account found with this email. Please check your email or create an account.')
      } else if (res === 'SUCCESS') {
        setSubmittedEmail(rawEmail)
        setIsSuccess(true)
        toast('success', 'If an account exists for this email, a reset link is on its way.')
      } else if (res) {
        setServerError(res)
        toast('error', res)
      }
    })
  }

  return (
    <Box
      className={cn('flex w-full flex-col gap-6 p-4 small:p-5 rounded-2xl border border-gray-100 shadow-sm', {
        'bg-primary': !isSuccess,
        'mx-auto max-w-[460px] items-center bg-white border-amber-200': isSuccess,
      })}
    >
      {isSuccess ? (
        <Box className="flex flex-col items-center text-center gap-4 py-4 w-full">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-3xl font-bold shadow-sm">
            ✉️
          </div>
          <Box className="text-center space-y-2">
            <Heading className="text-xl small:text-2xl font-bold text-gray-900">
              Check your inbox
            </Heading>
            <Text className="text-gray-600 text-xs sm:text-sm leading-relaxed max-w-sm">
              If an account exists for{' '}
              <strong className="text-gray-900 font-semibold">{submittedEmail}</strong>, we've sent it a password
              reset link. Please check your inbox and spam folder. The link is valid for 1 hour and works once.
            </Text>
          </Box>

          <Button
            variant="tonal"
            className="mt-4 w-full text-xs font-bold"
            onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          >
            ← Back to log in
          </Button>
        </Box>
      ) : (
        <>
          <Box className="flex flex-col gap-1.5">
            <Heading className="text-xl small:text-2xl font-bold text-gray-900">
              Forgot your password?
            </Heading>
            <Text className="text-gray-600 text-xs sm:text-sm">
              Enter the email associated with your account and we’ll send you a password reset link.
            </Text>
          </Box>

          {/* ── Unregistered Email Alert ───────────────────────────────────── */}
          {serverError === 'ACCOUNT_NOT_FOUND' && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-4 text-xs text-amber-950 flex flex-col gap-1.5 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                <span>⚠️</span>
                <span>Account not found</span>
              </div>
              <p className="leading-relaxed">
                No account found with this email. Please check your email or create an account.
              </p>
              <button
                type="button"
                onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
                className="self-start text-xs font-extrabold text-amber-900 underline hover:text-amber-950 mt-1 cursor-pointer"
              >
                Create an account now →
              </button>
            </div>
          )}

          {serverError && serverError !== 'ACCOUNT_NOT_FOUND' && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 font-medium">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-y-4">
              <Input
                label="Email address"
                name="email"
                type="email"
                autoComplete="email"
                required
                error={emailInputError}
                data-testid="email-input"
              />
            </div>
            <Box className="flex flex-col gap-3 mt-4">
              <SubmitButton
                data-testid="sign-in-button"
                className="w-full"
                isLoading={isPending}
              >
                Send Reset Link
              </SubmitButton>
              <Button
                variant="text"
                className="w-full text-xs text-gray-600 hover:text-gray-900 font-semibold"
                type="button"
                onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
              >
                Back to log in
              </Button>
            </Box>
          </form>
        </>
      )}
    </Box>
  )
}

export default ForgotPassword
