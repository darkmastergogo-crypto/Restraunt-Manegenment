/* =====================================================================
   SHOP BILLING — per-shop configuration
   Edit this one file for each shop you set up. Use only the PUBLIC
   (publishable / anon) key here. Never paste the service_role key.
   ===================================================================== */
const SHOP_CONFIG = {
  // Supabase → Project Settings → API
  supabaseUrl: "https://fitpqmvsadlapkdornxi.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpdHBxbXZzYWRsYXBrZG9ybnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMDg5MDIsImV4cCI6MjEwODg4NDkwMn0.CdrsSlKryobmrw1W9WYikNqqualle_h_TOT5-4Fq0Qg",

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
