// While demo sign-in is on, the first screen is the "לקוח" / "קצב" chooser; otherwise the email sign-in.
// The email form stays reachable at /login?classic=1.
import { DemoChooser } from "./DemoChooser";
import { EmailLogin } from "./LoginForm";
import { demoLoginEnabled } from "@/lib/demo-login";
import { safeNext } from "@/lib/market";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (!demoLoginEnabled() || params.classic) return <EmailLogin />;

  const { data } = await (await supabaseServer()).from("butchers").select("id, name").order("created_at");
  return <DemoChooser shops={data ?? []} next={safeNext(params.next)} failed={params.error === "demo"} />;
}
