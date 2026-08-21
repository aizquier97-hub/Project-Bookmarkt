import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  initializing: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, initializing: true });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setInitializing(false);
      }
    });

    // Rule (Stage 2 baseline §1): only synchronous state updates inside this
    // callback. All database work reacts to session state via React Query.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ session, initializing }}>{children}</AuthContext.Provider>;
}
