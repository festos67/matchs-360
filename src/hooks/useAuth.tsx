/**
 * @hook useAuth + AuthProvider
 * @description Provider et hook central d'authentification de l'application.
 *              Gère la session Supabase, le profil enrichi (profiles + user_roles),
 *              le rôle actif (multi-rôles) et expose les méthodes signIn/signOut.
 * @access Wrapper racine de toute l'application (App.tsx)
 * @features
 *  - Listener supabase.auth.onAuthStateChange (rafraîchissement automatique)
 *  - Chargement parallèle profiles + user_roles à chaque session
 *  - Détermination du rôle actif (persistance localStorage par utilisateur)
 *  - Détection compte soft-deleted (deleted_at) → signOut auto
 *  - Méthodes : signIn, signOut, switchRole, refreshProfile
 *  - Déduplication appels via état loading
 * @maintenance
 *  - Le rôle ACTIF (currentRole) est persisté localStorage uniquement comme
 *    préférence UI (clé `matchs360_current_role:<user_id>`). Toute vérification
 *    d'autorisation reste serveur via RLS / has_role(). Le contenu localStorage
 *    n'octroie aucun privilège — modifié par un attaquant, l'unique conséquence
 *    serait l'affichage d'un menu inadapté ; les RLS bloquent tout accès non autorisé.
 *  - Soft delete : mem://technical/soft-delete-strategy
 *  - Bascule de rôle : mem://auth/role-switching-logic
 *  - Super Admin défini par role='admin' en public.user_roles
 *    (RBAC, plus d'email codé en dur côté code applicatif).
 *  - Anti-récursion RLS via SECURITY DEFINER : mem://technical/rls-recursion-prevention
 */
import { useState, useEffect, createContext, useContext, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/query-client";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  club_id: string | null;
}

interface UserRole {
  id: string;
  role: "admin" | "club_admin" | "coach" | "player" | "supporter";
  club_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  currentRole: UserRole | null;
  loading: boolean;
  /** True only when the CURRENTLY SELECTED role is admin (for UI display) */
  isAdmin: boolean;
  /** True if the user HAS an admin role at all (for permission/security checks) */
  hasAdminRole: boolean;
  signOut: () => Promise<void>;
  setCurrentRole: (role: UserRole) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LEGACY_CURRENT_ROLE_KEY = "matchs360_current_role";
const buildCurrentRoleKey = (userId: string) => `matchs360_current_role:${userId}`;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [currentRole, setCurrentRoleState] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  // F-307: anti race condition. Chaque changement d'utilisateur (login, refresh,
  // switch d'identité) incrémente ce ticket. Les fetchs en vol comparent leur
  // ticket à la valeur courante au moment du setState : si désynchronisé, on
  // ignore le résultat (évite qu'un fetch lent de l'utilisateur A écrase le
  // state de l'utilisateur B).
  const authTicketRef = useRef(0);
  // Garde l'identifiant de l'utilisateur actuellement chargé en state, pour
  // détecter une transition A → B et purger profile/roles immédiatement.
  const loadedUserIdRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string, ticket: number) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    // F-307: ignorer si la session a changé entre-temps
    if (ticket !== authTicketRef.current) return;
    if (data) {
      setProfile(data as Profile);
    }
  };

  const fetchRoles = async (userId: string, ticket: number) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("id, role, club_id")
      .eq("user_id", userId);

    // F-307: ignorer si la session a changé entre-temps
    if (ticket !== authTicketRef.current) return;

    if (error) {
      console.error("Error fetching user roles:", error);
      return;
    }
    
    const userRoles = (data || []) as UserRole[];
    setRoles(userRoles);

    // Migration douce : ancienne clé globale → clé scopée par user
    const scopedKey = buildCurrentRoleKey(userId);
    const legacyValue = localStorage.getItem(LEGACY_CURRENT_ROLE_KEY);
    if (legacyValue && !localStorage.getItem(scopedKey)) {
      localStorage.setItem(scopedKey, legacyValue);
    }
    // Toujours nettoyer la legacy key (qu'elle ait été migrée ou pas pour cet user)
    if (legacyValue) localStorage.removeItem(LEGACY_CURRENT_ROLE_KEY);

    const savedRoleId = localStorage.getItem(scopedKey);
    const savedRole = userRoles.find(r => r.id === savedRoleId);
    if (savedRole) {
      setCurrentRoleState(savedRole);
    } else if (userRoles.length === 1) {
      // Mono-rôle : auto-select et persiste
      setCurrentRoleState(userRoles[0]);
      localStorage.setItem(scopedKey, userRoles[0].id);
    } else {
      // Multi-rôles sans choix précédent → null, le chooser DashboardRedirect s'affichera
      setCurrentRoleState(null);
      // Nettoyer une clé scopée qui pointerait vers un rôle qui n'existe plus
      if (savedRoleId) localStorage.removeItem(scopedKey);
    }
  };

  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
    if (user) {
      localStorage.setItem(buildCurrentRoleKey(user.id), role.id);
    }
  };

  // F-307: charge profile + roles de manière atomique (vis-à-vis du ticket) et
  // ne lève le flag loading qu'à la fin. Purge immédiate de l'ancien user pour
  // éviter tout leak transitoire.
  const loadUserContext = async (userId: string) => {
    authTicketRef.current += 1;
    const ticket = authTicketRef.current;

    // Si l'utilisateur change (A → B), purger l'ancien state AVANT de charger
    // le nouveau, pour qu'aucun composant ne voie roles_A + user_B.
    const isUserSwitch =
      loadedUserIdRef.current !== null && loadedUserIdRef.current !== userId;
    if (isUserSwitch) {
      setProfile(null);
      setRoles([]);
      setCurrentRoleState(null);
      // Purger le cache TanStack Query (données scopées à l'ancien user)
      queryClient.clear();
    }
    const isInitialLoad = loadedUserIdRef.current === null;
    loadedUserIdRef.current = userId;

    // F-XXX: ne lever le flag `loading` que pour le chargement initial ou un
    // changement d'utilisateur. Sinon (TOKEN_REFRESHED, USER_UPDATED, SIGNED_IN
    // sur la session courante), on rafraîchit profile/roles silencieusement —
    // sans démonter l'arbre via ProtectedRoute, ce qui détruirait l'état des
    // composants ouverts (modales avec saisie en cours, dialogues, formulaires).
    const shouldShowLoading = isInitialLoad || isUserSwitch;
    if (shouldShowLoading) setLoading(true);
    try {
      await Promise.all([
        fetchProfile(userId, ticket),
        fetchRoles(userId, ticket),
      ]);
    } catch (e) {
      // F-307: si l'un des fetch échoue (RLS, réseau), ne pas laisser un state
      // partiellement chargé. On purge pour forcer une déconnexion logique côté
      // ProtectedRoute (profile/roles vides → redirect auth).
      if (ticket === authTicketRef.current) {
        console.error("loadUserContext failed:", e);
        setProfile(null);
        setRoles([]);
        setCurrentRoleState(null);
      }
    } finally {
      // Même lors d'un second chargement silencieux du même utilisateur
      // (cas getSession + SIGNED_IN quasi simultanés), le dernier ticket doit
      // toujours pouvoir libérer l'écran de chargement. Sinon le premier load
      // devient obsolète et le second ne remet jamais loading=false.
      if (ticket === authTicketRef.current) {
        setLoading(false);
      }
    }
  };

  const clearUserContext = () => {
    authTicketRef.current += 1;
    loadedUserIdRef.current = null;
    setProfile(null);
    setRoles([]);
    setCurrentRoleState(null);
    queryClient.clear();
  };

  useEffect(() => {
    // F-307: tracker le timer pour pouvoir l'annuler si un nouvel event auth
    // survient avant que loadUserContext ne soit déclenché.
    let pendingLoadTimer: ReturnType<typeof setTimeout> | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Annule un load différé qui ne correspondrait plus à la session courante
        if (pendingLoadTimer !== null) {
          clearTimeout(pendingLoadTimer);
          pendingLoadTimer = null;
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const userId = session.user.id;
          const isInitialOrUserSwitch =
            loadedUserIdRef.current === null || loadedUserIdRef.current !== userId;
          if (isInitialOrUserSwitch) setLoading(true);
          // setTimeout(0) pour éviter un deadlock dans le callback auth
          pendingLoadTimer = setTimeout(() => {
            pendingLoadTimer = null;
            loadUserContext(userId);
          }, 0);
        } else {
          // Logout via auth event : nettoyer la clé scopée de l'user qui se déconnecte
          const previousUserId = loadedUserIdRef.current;
          if (previousUserId) {
            localStorage.removeItem(buildCurrentRoleKey(previousUserId));
          }
          localStorage.removeItem(LEGACY_CURRENT_ROLE_KEY);
          clearUserContext();
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        loadUserContext(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => {
      if (pendingLoadTimer !== null) {
        clearTimeout(pendingLoadTimer);
      }
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, authTicketRef.current);
    }
  };

  const signOut = async () => {
    const previousUserId = user?.id;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setCurrentRoleState(null);
    if (previousUserId) {
      localStorage.removeItem(buildCurrentRoleKey(previousUserId));
    }
    localStorage.removeItem(LEGACY_CURRENT_ROLE_KEY);
    // Clear cached queries to prevent cross-user data leakage on the same tab
    queryClient.clear();
  };

  // isAdmin = currently ACTING as admin (for UI)
  const isAdmin = currentRole?.role === "admin";
  // hasAdminRole = user HAS admin role (for security/permission checks)
  const hasAdminRole = roles.some((r) => r.role === "admin");

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        currentRole,
        loading,
        isAdmin,
        hasAdminRole,
        signOut,
        setCurrentRole,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
