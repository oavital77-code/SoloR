"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, inputDarkClass } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { he } from "@/lib/i18n/he";
import { supabaseBrowser } from "@/lib/supabase/client";
import { emailSchema, otpSchema } from "@/lib/validation";
import { safeNext } from "@/lib/market";
import Link from "next/link";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"email" | "code" | "password">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? he.auth.callbackFailed : null);
  const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "true";
  const next = safeNext(params.get("next"));

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(he.auth.invalidEmail);
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.status === 429 ? he.auth.rateLimited : he.auth.sendFailed);
    setEmail(parsed.data);
    setStage("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) return setError(he.auth.invalidCode);
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email, token: parsed.data, type: "email" });
    if (error) {
      setBusy(false);
      return setError(error.status === 429 ? he.auth.rateLimited : he.auth.invalidCode);
    }
    // full navigation so middleware routes by role / profile completeness
    window.location.assign(next);
  }

  // Password sign-in: for test accounts created by the founders (POC), alongside the email code flow
  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(he.auth.invalidEmail);
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: parsed.data, password });
    if (error) {
      setBusy(false);
      return setError(error.status === 429 ? he.auth.rateLimited : he.auth.invalidPassword);
    }
    window.location.assign(next);
  }

  async function google() {
    await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-[480px] flex-col justify-end overflow-hidden bg-ink px-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(200,16,46,0.45),transparent_60%)]" aria-hidden />
      <div className="relative mb-auto pt-[18dvh]">
        <Logo className="text-5xl" />
        <p className="mt-4 text-2xl font-semibold leading-snug text-white/90">{he.app.tagline}</p>
        {next !== "/" && <p className="mt-3 text-white/70">{he.auth.loginToOrder}</p>}
      </div>

      <div className="relative flex flex-col gap-4">
        {stage === "email" ? (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
            <label htmlFor="email" className="font-semibold">{he.auth.emailLabel}</label>
            <input
              id="email" type="email" inputMode="email" autoComplete="email" dir="ltr"
              className={inputDarkClass + " min-h-14 text-lg"} placeholder={he.auth.emailPlaceholder}
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
            <Button type="submit" size="lg" loading={busy}>{busy ? he.auth.sending : he.auth.sendCode}</Button>
            <Button type="button" variant="ghost" className="text-white/60" onClick={() => { setStage("password"); setError(null); }}>
              {he.auth.usePassword}
            </Button>
          </form>
        ) : stage === "password" ? (
          <form onSubmit={signInWithPassword} className="flex flex-col gap-3">
            <label htmlFor="email" className="font-semibold">{he.auth.emailLabel}</label>
            <input
              id="email" type="email" inputMode="email" autoComplete="username" dir="ltr"
              className={inputDarkClass + " min-h-14 text-lg"} placeholder={he.auth.emailPlaceholder}
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
            <label htmlFor="password" className="font-semibold">{he.auth.passwordLabel}</label>
            <input
              id="password" type="password" autoComplete="current-password" dir="ltr"
              className={inputDarkClass + " min-h-14 text-lg"}
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
            <Button type="submit" size="lg" loading={busy}>{busy ? he.auth.verifying : he.auth.verify}</Button>
            <Button type="button" variant="ghost" className="text-white/60" onClick={() => { setStage("email"); setError(null); }}>
              {he.auth.useCode}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <p className="text-white/80">{he.auth.codeSentTo(email)}</p>
            <label htmlFor="code" className="font-semibold">{he.auth.codeLabel}</label>
            <input
              id="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={10} autoFocus
              className={inputDarkClass + " min-h-14 text-center text-2xl tracking-[0.35em]"}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required
            />
            <Button type="submit" size="lg" loading={busy}>{busy ? he.auth.verifying : he.auth.verify}</Button>
            <div className="flex justify-center gap-6">
              <Button type="button" variant="ghost" className="text-white/70" onClick={() => { setStage("email"); setCode(""); }}>
                {he.auth.changeEmail}
              </Button>
              <Button type="button" variant="ghost" className="text-white/70" onClick={() => sendCode()} disabled={busy}>
                {he.auth.resend}
              </Button>
            </div>
          </form>
        )}

        {error && <p role="alert" className="rounded-2xl bg-red-900/60 px-4 py-3 font-semibold">{error}</p>}

        {googleEnabled && stage === "email" && (
          <>
            <div className="flex items-center gap-3 text-white/50"><span className="h-px flex-1 bg-white/20" />{he.auth.or}<span className="h-px flex-1 bg-white/20" /></div>
            <Button variant="dark" size="lg" onClick={google}>{he.auth.google}</Button>
          </>
        )}

        <Link href={next} className="min-h-11 py-2 text-center text-[15px] font-semibold text-white/60 underline underline-offset-4">
          {he.auth.continueAsGuest}
        </Link>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
