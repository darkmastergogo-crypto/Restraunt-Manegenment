/* =====================================================================
   SHOP BILLING — per-shop configuration
   Edit this one file for each shop you set up. Use only the PUBLIC
   (publishable / anon) key here. Never paste the service_role key.
   ===================================================================== */
const SHOP_CONFIG = {
  // Supabase → Project Settings → API
  supabaseUrl: "https://YOUR-PROJECT-ID.supabase.co",
  supabaseAnonKey: "PASTE_YOUR_PUBLISHABLE_OR_ANON_KEY",

  // Shown on the sign-in screen before the shop's own settings load.
  shopName: "My Shop",

  // Country code used for "Send on WhatsApp" when a 10-digit phone is entered.
  whatsappCountryCode: "91",

  // Software support shown in Help & contact (and optionally on printed bills).
  vendor: {
    name: "SHOI SYSTEMS",
    phone: "",
    whatsapp: "",
    email: "",
    website: "",
    showOnBill: true,        // prints "Billing software by SHOI SYSTEMS" at the bottom of bills
    showOnSignIn: true
  }
};
