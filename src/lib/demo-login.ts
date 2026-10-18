// Demo sign-in (founders' request, until further notice): the first screen is only "קצב" / "לקוח".
// On while DEMO_PASSWORD is set on the server; unset it to bring back the email sign-in.
// The accounts are created by migration 0009 and supabase/demo/demo_login_setup.sql.

export const demoLoginEnabled = () => !!process.env.DEMO_PASSWORD;

export const DEMO_CUSTOMER_EMAIL = "demo-customer@solor.example";

/** Same rule as demo_butcher_email() in the database. */
export const demoButcherEmail = (butcherId: string) => `demo-butcher-${butcherId}@solor.example`;
