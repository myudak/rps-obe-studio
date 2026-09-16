import { useState, type FormEvent } from "react"
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { api } from "@/platform/api"

// Adapted from the official shadcn login-02 block; only supported authentication is exposed.
export function LoginForm({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try { await api.send("/api/auth/sign-in/email", "POST", { email, password, rememberMe: true }); await onSuccess() }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Login gagal. Coba lagi.") }
    finally { setBusy(false) }
  }
  return <form className="flex flex-col gap-6" onSubmit={submit} aria-busy={busy}>
    <FieldGroup>
      <div className="mb-2 flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Masuk ke workspace</h1>
        <p className="text-sm text-muted-foreground">Gunakan akun RPS OBE Studio Anda.</p>
      </div>
      {error ? <Alert variant="destructive" role="alert"><AlertTitle>Tidak dapat masuk</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Field><FieldLabel htmlFor="login-email">Email</FieldLabel><Input id="login-email" type="email" autoComplete="username" placeholder="nama@undip.ac.id" required disabled={busy} value={email} onChange={event => setEmail(event.target.value)} className="h-11" /></Field>
      <Field><FieldLabel htmlFor="login-password">Password</FieldLabel><div className="relative"><Input id="login-password" type={visible ? "text" : "password"} autoComplete="current-password" required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="h-11 pr-11" /><Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1.5" aria-label={visible ? "Sembunyikan password" : "Tampilkan password"} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff /> : <Eye />}</Button></div></Field>
      <Field><Button type="submit" className="h-11 w-full" disabled={busy}>{busy ? <><Loader2 className="animate-spin" />Memeriksa akun…</> : <>Masuk<ArrowRight /></>}</Button></Field>
    </FieldGroup>
  </form>
}
