import { useGetProfile, useGetSettings } from "@workspace/api-client-react";

/**
 * Returns true when the super-admin has hidden balances AND the current user
 * is a regular member. Staff roles (admin, treasurer, auditor, super_admin)
 * always see real figures.
 */
export function useBalancesHidden(): boolean {
  const { data: profile } = useGetProfile();
  const { data: settings } = useGetSettings();
  return profile?.role === "member" && settings?.balancesHidden === true;
}
