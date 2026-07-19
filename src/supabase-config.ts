// These placeholders are replaced from .env.local in dist/ during npm run build.
// Never put credentials directly in this tracked source file.
export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

export function assertSupabaseConfigured(): void {
  if (SUPABASE_URL.includes("YOUR_PROJECT") || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
    throw new Error("请先在 .env.local 中配置 Supabase URL 和 anon key，然后重新构建扩展");
  }
}
