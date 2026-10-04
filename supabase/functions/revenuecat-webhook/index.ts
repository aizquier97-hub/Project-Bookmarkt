import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { handleWebhook } from "./handler.ts";

/**
 * RevenueCat webhook entry point (Stage 4 Phase 3/4). See `handler.ts` for
 * the request handling and `lifecycle.ts` for the (unit-tested) decisions.
 */
serve((req) =>
  handleWebhook(req, {
    secret: Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "",
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  })
);