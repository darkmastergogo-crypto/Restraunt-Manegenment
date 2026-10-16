/* Separate shop configuration. Public browser-safe values only; never use a service-role key. */
const RESTAURANT_CONFIG = {
  publicMenuUrl: "https://pizzawithyaar.vercel.app/",
  restaurantName: "",
  tagline: "Freshly made, served with love",
  currency: "₹",
  // Use this shop's OWN Supabase project, not another restaurant's project.
  supabaseUrl: "PASTE_NEW_PROJECT_URL_HERE",
  supabaseAnonKey: "PASTE_NEW_PUBLISHABLE_KEY_HERE",
  // Optional: this shop's Google review link. Blank disables the review prompt.
  googleReviewUrl: "",
  categories: ["All", "Starters", "Main Course", "Breads & Rice", "Drinks", "Desserts"],
  menuItems: []
};
