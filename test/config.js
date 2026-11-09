/* Separate shop configuration. Public browser-safe values only; never use a service-role key. */
const RESTAURANT_CONFIG = {
  platform: true,
  publicMenuUrl: "", // Blank uses this deployment for table QR links.
  restaurantName: "Yummy Momo",
  tagline: "Yummy in your tummy",
  currency: "₹",
  // Use this shop's OWN Supabase project, not another restaurant's project.
  supabaseUrl: "https://bcyzechgkczwbqfcaxan.supabase.co",
  supabaseAnonKey: "sb_publishable_I1hw3WZelA1GRjOcfCRGUw_HCCOHBMd",
  // Optional: this shop's Google review link. Blank disables the review prompt.
  googleReviewUrl: "",
  // Cloudflare R2 image storage (dish photos, category banners, logos, bill logo).
  // One Cloudflare R2 bucket can be shared by every restaurant deployed from this
  // same codebase — restaurantSlug just keeps each restaurant's images in their
  // own folder inside that bucket, so names never clash between restaurants.
  // Lowercase letters, numbers and hyphens only. Must be unique per restaurant.
  restaurantSlug: "yummy-momo",
  // Public base URL that serves the R2 bucket (no trailing slash), e.g.
  // "https://images.yourdomain.com" (custom domain, recommended) or the
  // bucket's own "https://pub-xxxxxxxx.r2.dev" URL. Leave blank to keep using
  // Supabase Storage for images (old behaviour).
  imagesBaseUrl: "",
  categories: ["All", "Steamed Momos", "Fried Momos", "Kurkure Momos", "Tandoori Momos", "Chutney & Dips", "Drinks", "Desserts"],
  menuItems: []
};
