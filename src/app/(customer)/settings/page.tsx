"use client";
// C7 — profile: name, phone (editable), email (read only), logout.
import { useEffect, useState } from "react";
import { BackLink } from "@/components/customer/market-ui";
import { useToast } from "@/components/Toast";
import { Button, Field, inputDarkClass } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { errorText } from "@/lib/errors";
import { useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { profileSchema } from "@/lib/validation";
import { PageLoader } from "@/components/motion/Steak";
import { Rise } from "@/components/motion/Rise";

export default function ProfilePage() {
  const { user, profile, loading } = useSession();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) { setFullName(profile.full_name); setPhone(profile.phone); }
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const parsed = profileSchema.safeParse({ full_name: fullName, phone });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      return setErrors({ full_name: f.full_name?.[0], phone: f.phone?.[0] });
    }
    setErrors({});
    setBusy(true);
    const { error } = await supabaseBrowser().from("profiles").update(parsed.data).eq("id", user.id);
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    setPhone(parsed.data.phone);
    toast(he.profile.saved, { tone: "success" });
  }

  if (loading) return <PageLoader />;

  return (
    <main className="min-h-dvh px-5 pb-24 lg:mx-auto lg:w-full lg:max-w-[760px]">
      <header className="pt-2 pb-6">
        <BackLink href="/" label={he.app.back} />
        <Rise lines={[he.profile.title]} className="mt-1 font-display text-[32px] font-black leading-10 text-ivory" />
      </header>
      <form onSubmit={save} className="flex flex-col gap-5">
        <Field dark label={he.onboarding.fullName} htmlFor="name" error={errors.full_name}>
          <input id="name" className={inputDarkClass + " min-h-14 text-lg"} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </Field>
        <Field dark label={he.onboarding.phone} htmlFor="phone" error={errors.phone}>
          <input id="phone" type="tel" inputMode="tel" dir="ltr" className={inputDarkClass + " min-h-14 text-lg"} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </Field>
        <Field dark label={he.profile.email} htmlFor="email">
          <input id="email" dir="ltr" readOnly className={inputDarkClass + " min-h-14 text-lg opacity-60"} value={user?.email ?? ""} />
        </Field>
        <Button type="submit" size="lg" loading={busy}>{he.app.save}</Button>
      </form>
      <form action="/auth/signout" method="post" className="mt-10">
        <Button type="submit" variant="dark" size="lg" className="w-full">{he.profile.logout}</Button>
      </form>
    </main>
  );
}
