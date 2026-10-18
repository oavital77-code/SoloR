"use client";
import { useState } from "react";
import { Button, Field, inputDarkClass } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { he } from "@/lib/i18n/he";
import { supabaseBrowser } from "@/lib/supabase/client";
import { profileSchema } from "@/lib/validation";
import { errorText } from "@/lib/errors";
import { safeNext } from "@/lib/market";

export default function OnboardingPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({ full_name: fullName, phone });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      return setErrors({ full_name: f.full_name?.[0], phone: f.phone?.[0] });
    }
    setBusy(true);
    setErrors({});
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return window.location.assign("/login");
    const { error } = await sb.from("profiles").insert({ id: user.id, ...parsed.data });
    if (error && error.code !== "23505") {
      setBusy(false);
      return setErrors({ form: errorText(error) });
    }
    window.location.assign(safeNext(new URLSearchParams(window.location.search).get("next")));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-ink px-6 py-10 text-center text-white">
      <Logo height={28} />
      <h1 className="mt-10 text-3xl font-extrabold">{he.onboarding.title}</h1>
      <p className="mt-2 text-white/70">{he.onboarding.subtitle}</p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-5 [&_label]:text-white">
        <Field dark label={he.onboarding.fullName} htmlFor="name" error={errors.full_name}>
          <input id="name" autoComplete="name" className={inputDarkClass + " min-h-14 text-lg"}
            value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field dark label={he.onboarding.phone} htmlFor="phone" error={errors.phone}>
          <input id="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder={he.onboarding.phonePlaceholder}
            className={inputDarkClass + " min-h-14 text-lg"} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {errors.form && <p role="alert" className="rounded-2xl bg-red-900/60 px-4 py-3 font-semibold">{errors.form}</p>}
        <Button type="submit" size="lg" loading={busy} className="mt-4">{he.onboarding.submit}</Button>
      </form>
    </main>
  );
}
