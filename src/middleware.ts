// Route protection (review stage 1): the catalogue is open to guests; identity is required only to
// order, see orders or the profile. Butchers always land in their own interface.
// While demo sign-in is on, there are no guests: every path starts at the "לקוח" / "קצב" screen,
// which stays open to signed-in users too, so they can switch.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { demoLoginEnabled } from "@/lib/demo-login";

const GUEST_EXACT = ["/", "/discover", "/search", "/categories", "/shops", "/login", "/cart"];
const GUEST_PREFIXES = ["/b/", "/cut/", "/auth/"];

function isGuestPath(path: string) {
  if (demoLoginEnabled()) return path === "/login" || path.startsWith("/auth/");
  return GUEST_EXACT.includes(path) || GUEST_PREFIXES.some((p) => path.startsWith(p));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  const here = path + request.nextUrl.search;

  const { data: { user } } = await supabase.auth.getUser();

  const redirect = (to: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user) {
    return isGuestPath(path) ? response : redirect("/login", here);
  }

  if (path.startsWith("/auth/")) return response; // callback / signout handle themselves

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  if (!profile) {
    if (path === "/onboarding") return response;
    const next = request.nextUrl.searchParams.get("next") ?? (path === "/login" ? "/" : here);
    return redirect("/onboarding", next);
  }

  if (path === "/login" && demoLoginEnabled()) return response;

  if (path === "/login" || path === "/onboarding") {
    const next = request.nextUrl.searchParams.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    if (profile.role === "butcher") return redirect("/butcher");
    const url = request.nextUrl.clone();
    url.pathname = safe ? safe.split("?")[0] : "/";
    url.search = safe && safe.includes("?") ? safe.slice(safe.indexOf("?")) : "";
    return NextResponse.redirect(url);
  }

  const inButcher = path === "/butcher" || path.startsWith("/butcher/");
  if (profile.role === "butcher" && !inButcher) return redirect("/butcher");
  if (profile.role !== "butcher" && inButcher) return redirect("/");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
