/* Separate shop configuration. Public browser-safe values only; never use a service-role key. */
const RESTAURANT_CONFIG = {
  publicMenuUrl: "https://pizzawithyaar.vercel.app/",
  restaurantName: "",
  tagline: "Freshly made, served with love",
  currency: "₹",
  // Use this shop's OWN Supabase project, not another restaurant's project.
  supabaseUrl: "https://ibgtonljqqemqxlmczfo.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZ3RvbmxqcXFlbXF4bG1jemZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTA0MTMsImV4cCI6MjEwNzY4NjQxM30.0AJYFu20c2x80v98K4DulwwC4-0TTQZEiBLeRpP-e7c",
  // Optional: this shop's Google review link. Blank disables the review prompt.
  googleReviewUrl: "",
  categories: ["All", "Starters", "Main Course", "Breads & Rice", "Drinks", "Desserts"],
  menuItems: []
};
