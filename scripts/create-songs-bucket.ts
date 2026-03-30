import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await admin.storage.createBucket("songs", {
    public: true,
    allowedMimeTypes: ["audio/mpeg", "audio/mp3", "image/jpeg", "image/png", "image/webp", "image/gif"],
    fileSizeLimit: 52428800, // 50MB
  });

  if (error) {
    if (error.message?.includes("already exists")) {
      console.log("songs bucket already exists");
    } else {
      console.error("Failed to create bucket:", error.message);
      process.exit(1);
    }
  } else {
    console.log("Created songs bucket:", data);
  }
}

main();
