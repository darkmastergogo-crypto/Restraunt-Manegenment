/* Separate shop configuration. Public browser-safe values only; never use a service-role key. */
const RESTAURANT_CONFIG = {
  publicMenuUrl: "https://pizzawithyaar.vercel.app/",
  restaurantName: "",
  tagline: "Freshly made, served with love",
  currency: "₹",
  // Use this shop's OWN Supabase project, not another restaurant's project.
  supabaseUrl: "https://srdwtlipvdhwjbxveqtd.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyZHd0bGlwdmRod2pieHZlcXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MjA3NjUsImV4cCI6MjEwNzI5Njc2NX0.jmo7YHweokSG5DYf54lrW3h5udGfOTg_O9hDZk5Tho0",
  // Optional: this shop's Google review link. Blank disables the review prompt.
  googleReviewUrl: "",
  categories: ["All", "Starters", "Main Course", "Breads & Rice", "Drinks", "Desserts"],
  menuItems: []
};
