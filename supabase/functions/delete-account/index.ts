import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Account deletion (Stage 4 Phase 4 foundations, STAGE_4_BUILD_PLAN.md).
 *
 * The signed-in user deletes their own account - nothing else. Order:
 *   1. authenticate the caller from their JWT (401 otherwise)
 *   2. remove stored images (paths read from the user's book_images rows)
 *   3. explicitly delete authored rows (entries, characters, book_images,
 *      topics) - explicit because the earliest tables predate cascade rules
 *   4. release claimed bookmark codes back to unclaimed
 *   5. delete the auth user - newer tables (companion, analytics, reports,
 *      embeddings) cascade from auth.users
 *
 * Companion usage audit rows cascade with the user: an account that no
 * longer exists keeps no usage history (data-minimization over bookkeeping).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

const BOOK_IMAGES_BUCKET = "book_images";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed.", code: "BAD_REQUEST" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Deletion service is not configured.", code: "MISCONFIGURED" }, 500);
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return jsonResponse({ error: "Authentication required. Please sign in again.", code: "UNAUTHORIZED" }, 401);
  }

  try {
    // 1. Stored images: collect paths from the user's rows, then remove.
    const { data: imageRows, error: imagesError } = await admin
      .from("book_images")
      .select("storage_path, image_url")
      .eq("user_id", userId);
    if (imagesError) {
      throw new Error(`image rows: ${imagesError.message}`);
    }
    const storagePaths = Array.from(
      new Set(
        (imageRows ?? [])
          .map((row) => {
            if (row.storage_path) return String(row.storage_path);
            const url = String(row.image_url ?? "");
            const marker = `/object/public/${BOOK_IMAGES_BUCKET}/`;
            const index = url.indexOf(marker);
            return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : "";
          })
          .filter((path) => path.length > 0),
      ),
    );
    if (storagePaths.length > 0) {
      // Best effort: an already-missing object must not block deletion.
      await admin.storage.from(BOOK_IMAGES_BUCKET).remove(storagePaths);
    }

    // 2. Authored rows, children before parents.
    for (const table of ["entries", "characters", "book_images", "topics"] as const) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) {
        throw new Error(`${table}: ${error.message}`);
      }
    }

    // 3. Release physical bookmark codes back to the unclaimed pool.
    const { error: bookmarksError } = await admin
      .from("bookmarks")
      .update({ user_id: null, topic_id: null, claimed_at: null, linked_at: null })
      .eq("user_id", userId);
    if (bookmarksError) {
      throw new Error(`bookmarks: ${bookmarksError.message}`);
    }

    // 4. The auth user itself; remaining tables cascade.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`auth user: ${deleteError.message}`);
    }

    return jsonResponse({ deleted: true });
  } catch (failure) {
    console.error("account deletion failed", failure);
    return jsonResponse(
      { error: "Your account could not be deleted. Please try again or contact support.", code: "DELETE_FAILED" },
      500,
    );
  }
});
