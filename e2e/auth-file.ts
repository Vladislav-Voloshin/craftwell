import path from "path";

/** Path to the stored Playwright auth state (Supabase session cookies). */
export const AUTH_FILE = path.join(__dirname, "../.auth/user.json");
