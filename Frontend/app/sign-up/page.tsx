import { redirect } from 'next/navigation'

// Public registration is disabled. Only admins can create accounts.
export default function SignUpPage() {
  redirect('/sign-in')
}
