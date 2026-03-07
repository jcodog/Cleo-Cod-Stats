import { SignIn } from "@clerk/nextjs"

export function SignInView() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4 py-10">
      <SignIn />
    </div>
  )
}
