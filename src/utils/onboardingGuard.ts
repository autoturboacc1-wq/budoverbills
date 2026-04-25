export type OnboardingProfile = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  pdpa_accepted_at?: string | null;
} | null;

export function hasCompletedPersonalInfo(profile: OnboardingProfile) {
  return Boolean(
    profile?.first_name?.trim() &&
    profile?.last_name?.trim() &&
    profile?.phone?.trim()
  );
}

export function getRequiredOnboardingPath(profile: OnboardingProfile, pathname: string) {
  if (!hasCompletedPersonalInfo(profile)) {
    return pathname === "/personal-info" ? null : "/personal-info";
  }

  if (!profile?.pdpa_accepted_at && pathname !== "/pdpa-consent") {
    return "/pdpa-consent";
  }

  return null;
}
