/* =====================================================================
   SHOP BILLING — per-shop configuration
   Edit this one file for each shop you set up. Use only the PUBLIC
   (publishable / anon) key here. Never paste the service_role key.
   Support contact, branding, payments and permissions are set inside
   the app by the Admin login (Admin tab), not here.
   ===================================================================== */
const SHOP_CONFIG = {
  // Supabase → Project Settings → API
  supabaseUrl: "https://YOUR-PROJECT-ID.supabase.co",
  supabaseAnonKey: "PASTE_YOUR_PUBLISHABLE_OR_ANON_KEY",

  // Shown on the sign-in screen only until the shop's own name loads.
  shopName: "My Shop",

  // Country code used for "Send on WhatsApp" when a 10-digit phone is entered.
  whatsappCountryCode: "91"
};
