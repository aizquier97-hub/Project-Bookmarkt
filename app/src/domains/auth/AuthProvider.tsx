import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
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
  const previousUserId = useRef<string | null>(null);

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
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_IN' && nextSession?.user) {
        const isNewSessionUser = previousUserId.current !== nextSession.user.id;
        previousUserId.current = nextSession.user.id;
        // Deferred: inserting inside the callback would deadlock gotrue's
        // auth lock (PWA lesson). Analytics is fire-and-forget anyway.
        setTimeout(() => {
          trackAnalyticsEvent('user_signed_in', { sourceEvent: event, isNewSessionUser });
        }, 0);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ session, initializing }}>{children}</AuthContext.Provider>;
}
