import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

const CURRENT_ROLE_KEY = "matchs360_current_role";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [currentRole, setCurrentRoleState] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    
    if (data) {
      setProfile(data as Profile);
    }
  };

  const fetchRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("id, role, club_id")
      .eq("user_id", userId);
    
    if (error) {
      console.error("Error fetching user roles:", error);
      return;
    }
    
    const userRoles = (data || []) as UserRole[];
    setRoles(userRoles);
    
    // Restore saved role or use first role
    const savedRoleId = localStorage.getItem(CURRENT_ROLE_KEY);
    const savedRole = userRoles.find(r => r.id === savedRoleId);
    if (savedRole) {
      setCurrentRoleState(savedRole);
    } else if (userRoles.length > 0) {
      setCurrentRoleState(userRoles[0]);
    } else {
      setCurrentRoleState(null);
    }
  };

  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
    localStorage.setItem(CURRENT_ROLE_KEY, role.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchRoles(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setCurrentRoleState(null);
          localStorage.removeItem(CURRENT_ROLE_KEY);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setCurrentRoleState(null);
    localStorage.removeItem(CURRENT_ROLE_KEY);
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
