import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth, type UserRole } from '../auth/AuthProvider'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

type FormValues = z.infer<typeof schema>

export default function AuthPage() {
  const navigate = useNavigate()
  const { loading: authLoading, role } = useAuth()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    defaultValues: { email: '', password: '' }
  })

  useEffect(() => {
    if (authLoading) return
    if (!role) return
    navigate(`/app/${role as UserRole}`)
  }, [authLoading, role, navigate])

  async function onSubmit(values: FormValues) {
    setFormError(null)

    const parsed = schema.safeParse(values)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword(values)
      if (error) {
        setFormError(error.message)
        return
      }
      return
    }

    const { error } = await supabase.auth.signUp(values)
    if (error) {
      setFormError(error.message)
      return
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Student CRM</h1>
      <p className="text-sm opacity-80 mb-4">
        Sign in with email/password. New users default to role <span className="font-mono">client</span>.
      </p>

      <div className="flex gap-2 mb-4">
        <button
          className={`flex-1 border rounded px-3 py-2 ${
            mode === 'login' ? 'bg-black/5' : 'bg-transparent'
          }`}
          type="button"
          onClick={() => setMode('login')}
        >
          Log in
        </button>
        <button
          className={`flex-1 border rounded px-3 py-2 ${
            mode === 'signup' ? 'bg-black/5' : 'bg-transparent'
          }`}
          type="button"
          onClick={() => setMode('signup')}
        >
          Sign up
        </button>
      </div>

      <form
        className="space-y-3"
        onSubmit={handleSubmit((v) => onSubmit(v))}
        autoComplete="on"
      >
        <label className="block">
          <div className="text-sm mb-1">Email</div>
          <input
            className="w-full border rounded px-3 py-2"
            type="email"
            {...register('email')}
          />
          {errors.email?.message ? (
            <div className="text-sm text-red-600 mt-1">{errors.email.message}</div>
          ) : null}
        </label>

        <label className="block">
          <div className="text-sm mb-1">Password</div>
          <input
            className="w-full border rounded px-3 py-2"
            type="password"
            {...register('password')}
          />
          {errors.password?.message ? (
            <div className="text-sm text-red-600 mt-1">{errors.password.message}</div>
          ) : null}
        </label>

        {formError ? <div className="text-sm text-red-600">{formError}</div> : null}

        <button className="w-full border rounded px-3 py-2" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
    </div>
  )
}

