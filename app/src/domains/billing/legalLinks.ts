/**
 * Legal links shown wherever a subscription is offered (D-085). Apple's
 * review guideline 3.1.2 requires a working Terms of Use (EULA) and privacy
 * policy link next to any auto-renewable subscription; Play asks for the
 * privacy policy in the listing. Until Bookmarkt publishes its own Terms
 * (Stage 6), iOS links Apple's standard EULA - the one Apple applies by
 * default to App Store apps - and Android shows the privacy policy only.
 */

export const PRIVACY_POLICY_URL = 'https://bookmarkt.io/privacy';

/** Apple's standard licensed-application EULA, accepted by App Review as the Terms of Use link. */
export const APPLE_STANDARD_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export interface LegalLink {
  id: 'privacy' | 'terms';
  label: string;
  url: string;
}

export function subscriptionLegalLinks(platform: string): LegalLink[] {
  const links: LegalLink[] = [{ id: 'privacy', label: 'Privacy Policy', url: PRIVACY_POLICY_URL }];
  if (platform === 'ios') {
    links.push({ id: 'terms', label: 'Terms of Use', url: APPLE_STANDARD_EULA_URL });
  }
  return links;
}
