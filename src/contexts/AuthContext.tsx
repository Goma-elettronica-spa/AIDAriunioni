import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  tenant_id: string | null;
  job_title: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (session: Session) => {
    const userId = session.user.id;
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, role, tenant_id, job_title")
      .eq("id", userId)
      .maybeSingle();

    if (data) {
      setUser(data);
      return data;
    }

    // No profile found — check if we have registration metadata to create one
    const meta = session.user.user_metadata || {};
    const registrationType = meta.registration_type as string | undefined;
    const email = session.user.email?.toLowerCase() || "";

    if (registrationType === "create_org") {
      const { error: rpcError } = await supabase.rpc("register_with_new_tenant", {
        p_user_id: userId,
        p_email: email,
        p_full_name: (meta.full_name as string) || "",
        p_tenant_name: (meta.tenant_name as string) || "",
        p_vat_number: (meta.vat_number as string) || "",
      });
      if (!rpcError) {
        // Re-fetch the profile after creation
        const { data: newProfile } = await supabase
          .from("users")
          .select("id, email, full_name, role, tenant_id, job_title")
          .eq("id", userId)
          .maybeSingle();
        if (newProfile) {
          setUser(newProfile);
          return newProfile;
        }
      }
    } else if (registrationType === "join_org") {
      const tenantId = (meta.tenant_id as string) || "";
      const { data: result } = await supabase.rpc("register_and_join_tenant", {
        p_user_id: userId,
        p_email: email,
        p_full_name: (meta.full_name as string) || "",
        p_tenant_id: tenantId,
      });
      // Re-fetch profile
      const { data: newProfile } = await supabase
        .from("users")
        .select("id, email, full_name, role, tenant_id, job_title")
        .eq("id", userId)
        .maybeSingle();
      if (newProfile) {
        setUser(newProfile);
        return newProfile;
      }
    }

    // Try reconciliation by email
    if (email) {
      const { data: emailProfile } = await supabase
        .from("users")
        .select("id, email, full_name, role, tenant_id, job_title")
        .eq("email", email)
        .maybeSingle();

      if (emailProfile && emailProfile.id !== userId) {
        await supabase.from("users").update({ id: userId }).eq("id", emailProfile.id);
        const reconciled = { ...emailProfile, id: userId };
        setUser(reconciled);
        return reconciled;
      } else if (emailProfile) {
        setUser(emailProfile);
        return emailProfile;
      }
    }

    setUser(null);
    return null;
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          // Use setTimeout to avoid potential deadlock with Supabase client
          setTimeout(() => fetchProfile(newSession.user.id), 0);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      if (existingSession?.user) {
        fetchProfile(existingSession.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
