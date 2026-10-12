-- Internal helpers / trigger functions are not part of the client API (Supabase default privileges grant them to authenticated)
revoke execute on function
  cut_missing_fields(cuts),
  compute_stock(cuts),
  cuts_guard_update(),
  cut_media_guard_delete(),
  set_updated_at(),
  cut_has_active_orders(uuid)
from public, anon, authenticated;
