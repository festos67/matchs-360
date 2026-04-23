/**
 * @hook useClubAdminScope
 * @description Returns the list of club IDs the user administers as `club_admin`,
 *              plus a `isSuperAdmin` flag (true admin role). Used to scope listings
 *              and drill-in guards for tenant isolation.
 *              Super admins receive `isSuperAdmin = true` and `myAdminClubIds = []`
 *              (callers should bypass filters when isSuperAdmin).
 */
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";

export function useClubAdminScope() {
  const { roles, hasAdminRole } = useAuth();
  const myAdminClubIds = useMemo(
    () =>
      roles
        .filter((r) => r.role === "club_admin" && r.club_id)
        .map((r) => r.club_id as string),
    [roles]
  );
  return { isSuperAdmin: hasAdminRole, myAdminClubIds };
}