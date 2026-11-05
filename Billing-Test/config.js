/* =====================================================================
   SHOP BILLING — per-shop configuration
   Edit this one file for each shop you set up. Use only the PUBLIC
   (publishable / anon) key here. Never paste the service_role key.
   Support contact, branding, payments and permissions are set inside
   the app by the Admin login (Admin tab), not here.
   ===================================================================== */
const SHOP_CONFIG = {
  // Supabase → Project Settings → API
  supabaseUrl: "https://lkaqvohgpjtfphiholfu.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYXF2b2hncGp0ZnBoaWhvbGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MjkxMDgsImV4cCI6MjEwOTQwNTEwOH0.dfoTsQ54Mzupl-yD69Cesu2z-MewW7tdfObxLULZV_U",

  // Shown on the sign-in screen only until the shop's own name loads.
  shopName: "blling tes",

  // Country code used for "Send on WhatsApp" when a 10-digit phone is entered.
  whatsappCountryCode: "91"
};
