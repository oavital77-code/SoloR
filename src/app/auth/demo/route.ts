// Demo sign-in: "לקוח" signs in as the shared demo customer, "קצב" as the chosen shop's demo butcher.
// The password never leaves the server.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { DEMO_CUSTOMER_EMAIL, demoButcherEmail, demoLoginEnabled } from "@/lib/demo-login";
import { safeNext } from "@/lib/market";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = () => NextResponse.redirect(`${origin}/login?error=demo`, { status: 303 });
  if (!demoLoginEnabled()) return fail();

  const form = await request.formData();
  const as = form.get("as");
  const shop = String(form.get("shop") ?? "");
  let email: string;
  if (as === "customer") email = DEMO_CUSTOMER_EMAIL;
  else if (as === "butcher" && UUID.test(shop)) email = demoButcherEmail(shop.toLowerCase());
  else return fail();

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD! });
  if (error) return fail();

  const to = as === "butcher" ? "/butcher" : safeNext(String(form.get("next") ?? ""));
  return NextResponse.redirect(`${origin}${to}`, { status: 303 });
}
