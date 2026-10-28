/* Separate shop configuration. Public browser-safe values only; never use a service-role key. */
const RESTAURANT_CONFIG = {
  publicMenuUrl: "", // Blank uses this deployment for table QR links.
  restaurantName: "Yummy Momo",
  tagline: "Yummy in your tummy",
  currency: "₹",
  // Shared SHOI SYSTEMS image service. Set a UNIQUE ID for each restaurant deployment.
  restaurantId: "restraunt-00001", // e.g. "restaurant-001"; must also be registered in the central service.
  imageUploadServiceUrl: "https://shoi-central-image-upload.darkmastergogo.workers.dev",
  // Use this shop's OWN Supabase project, not another restaurant's project.
  supabaseUrl: "https://ibqubjavznusojfgmllp.supabase.co",
  supabaseAnonKey: "sb_publishable_e-pMdSNEs3ugEn_TGpRGFw_EPnnTnq6",
  // Optional: this shop's Google review link. Blank disables the review prompt.
  googleReviewUrl: "",
  categories: ["All", "Steamed Momos", "Fried Momos", "Kurkure Momos", "Tandoori Momos", "Chutney & Dips", "Drinks", "Desserts"],
  menuItems: []
};
