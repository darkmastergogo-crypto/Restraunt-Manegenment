/* Separate shop configuration. Public browser-safe values only; never use a service-role key. */
const RESTAURANT_CONFIG = {
  publicMenuUrl: "https://pizzawithyaar.vercel.app/",
  restaurantName: "Pizza With Yaar",
  tagline: "Freshly made, served with love",
  currency: "₹",
  // Direct UPI payments: replace BOTH placeholders before enabling customer payments.
  // Use the restaurant's own receiving merchant UPI ID. These are public details, not secrets.
  upiEnabled: true,
  upiId: "9608252201@paytm",
  upiPayeeName: "ARYAN SINGH",
  // Use this shop's OWN Supabase project, not another restaurant's project.
  supabaseUrl: "https://ibgtonljqqemqxlmczfo.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZ3RvbmxqcXFlbXF4bG1jemZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTA0MTMsImV4cCI6MjEwNzY4NjQxM30.0AJYFu20c2x80v98K4DulwwC4-0TTQZEiBLeRpP-e7c",
  // Optional: this shop's Google review link. Blank disables the review prompt.
  googleReviewUrl: "",
  categories: ["All", "Heart Shape Pizza", "New Pizza Flavours", "Pizza", "Hot Lava Cake", "Kurkure Momos", "Chutney & Dips", "Drinks (Beverages)"],
  menuItems: []
};
