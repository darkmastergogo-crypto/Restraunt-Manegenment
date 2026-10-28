/* Separate shop configuration. Public browser-safe values only; never use a service-role key. */
const RESTAURANT_CONFIG = {
  publicMenuUrl: "https://test2-lac-psi.vercel.app", // Blank uses this deployment for table QR links.
  restaurantName: "Yummy Momo",
  tagline: "Yummy in your tummy",
  currency: "₹",
  // Shared SHOI SYSTEMS image service. Set a UNIQUE ID for each restaurant deployment.
  restaurantId: "restaurant-001", // e.g. "restaurant-001"; must also be registered in the central service.
  imageUploadServiceUrl: "https://shoi-central-image-upload.darkmastergogo.workers.dev",
  // Use this shop's OWN Supabase project, not another restaurant's project.
  supabaseUrl: "https://luvfnrmagdwcsjvbfkmk.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1dmZucm1hZ2R3Y3NqdmJma21rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNzQ0OTEsImV4cCI6MjEwODc1MDQ5MX0.GJx1iNXgWS9xsWou-PilBZ7kZ2jMxfAjfqVEQaLZGR8",
  // Optional: this shop's Google review link. Blank disables the review prompt.
  googleReviewUrl: "",
  categories: ["All", "Steamed Momos", "Fried Momos", "Kurkure Momos", "Tandoori Momos", "Chutney & Dips", "Drinks", "Desserts"],
  menuItems: []
};
