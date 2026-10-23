import { AppwriteStore } from "./store.mjs";
import { maintain } from "./maintenance.mjs";
export default async ({ req, res, error }) => {
  try {
    const key = req.headers["x-appwrite-key"];
    if (!key) throw Error("Missing runtime key.");
    const store = new AppwriteStore({
      endpoint:
        process.env.APPWRITE_FUNCTION_API_ENDPOINT ||
        "https://fra.cloud.appwrite.io/v1",
      project:
        process.env.APPWRITE_FUNCTION_PROJECT_ID || "6ad97acd003c74f33ec9",
      key,
      database: process.env.DATABASE_ID || "restaurant_platform",
    });
    return res.json(await maintain(store));
  } catch (e) {
    error("Maintenance failed: " + e.message);
    return res.json({ error: "Maintenance failed. Inspect logs." }, 500);
  }
};
