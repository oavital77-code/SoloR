"use client";
// Keeps the cart on the account while signed in (customer spec §9.1): on sign-in the device's cart is merged into
// the account's, and later changes are saved back. The shared demo customer is left out — every founder signs in
// as the same account there, and their carts must not mix. It also keeps the cart's cuts held (lib/cartHold).
import { useEffect } from "react";
import { cart, mergeCarts, sanitizeCart } from "@/lib/cart";
import { syncCartHold } from "@/lib/cartHold";
import { useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

export function CartSync() {
  const { user, loading } = useSession();
  const userId = user && !user.email?.endsWith("@solor.example") ? user.id : null;

  useEffect(() => {
    if (!userId) return;
    const sb = supabaseBrowser();
    let alive = true;
    let timer: number | undefined;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sb.from("carts").upsert({ user_id: userId, lines: cart.get(), updated_at: new Date().toISOString() }).then(() => {});
      }, 600);
    };
    let unsubscribe = () => {};
    sb.from("carts").select("lines").eq("user_id", userId).maybeSingle().then(({ data, error }) => {
      if (!alive || error) return;
      cart.replace(mergeCarts(cart.get(), sanitizeCart(data?.lines ?? [])));
      save();
      unsubscribe = cart.subscribe(save);
    });
    return () => { alive = false; window.clearTimeout(timer); unsubscribe(); };
  }, [userId]);

  // the hold on the cart's cuts (0021): sent again on every change, a moment after it settles
  const signedIn = !!user;
  useEffect(() => {
    if (loading) return;
    let t: number | undefined;
    const run = () => { window.clearTimeout(t); t = window.setTimeout(() => { syncCartHold(signedIn); }, 400); };
    run();
    const unsubscribe = cart.subscribe(run);
    return () => { window.clearTimeout(t); unsubscribe(); };
  }, [signedIn, loading]);

  return null;
}
