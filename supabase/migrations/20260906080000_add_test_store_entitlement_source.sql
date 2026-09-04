-- Stage 4 Phase 3 (STAGE_4_BUILD_PLAN.md): billing arrives via RevenueCat.
-- Its Test Store lets the whole purchase -> webhook -> entitlement path be
-- verified before the Play Console product exists, so the entitlement
-- source constraint gains 'test_store'.

alter table public.companion_entitlements
  drop constraint if exists companion_entitlements_source_check;

alter table public.companion_entitlements
  add constraint companion_entitlements_source_check
  check (source in ('none', 'dev_comp', 'trial', 'app_store', 'play_store', 'test_store'));
