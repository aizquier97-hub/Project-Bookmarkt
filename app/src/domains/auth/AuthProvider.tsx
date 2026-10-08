import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { parseAuthLink, type AuthLinkType } from '@/domains/auth/authLink';
import { friendlyAuthMessage } from '@/domains/auth/policy';
import { createSessionFromRecoveryUrl } from '@/domains/auth/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { supabase } from '@/lib/supabase';

/**
 * Progress of the most recent emailed auth link (sign-up confirmation or
 * password recovery) the OS handed to the app.
 * - pending: the launch URL has not been inspected yet
 * - idle: no auth link, or the link carried no session tokens
 * - establishing: tokens found, session being stored
 * - established: session stored from the link
 * - error: Supabase reported the link expired/invalid, or storing failed
 */
export type AuthLinkState = {
  status: 'pending' | 'idle' | 'establishing' | 'established' | 'error';
  type: AuthLinkType | null;
  error: string | null;
};

type AuthState = {
  session: Session | null;
  initializing: boolean;
  authLink: AuthLinkState;
};

const idleLink: AuthLinkState = { status: 'idle', type: null, error: null };

const AuthContext = createContext<AuthState>({
  session: null,
  initializing: true,
  authLink: { status: 'pending', type: null, error: null },
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authLink, setAuthLink] = useState<AuthLinkState>({
    status: 'pending',
    type: null,
    error: null,
  });
  const previousUserId = useRef<string | null>(null);
  const handledUrl = useRef<string | null>(null);

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

  // Emailed links are handled here, at the root, rather than on the landing
  // screens: on a warm start expo-router navigates to the screen in response
  // to the same `url` event, so a listener mounted by that screen misses it,
  // and RN's getInitialURL only ever knows the launch intent. Expo's
  // getLinkingURL returns the latest URL the OS delivered, and this
  // listener has been registered since launch.
  useEffect(() => {
    let mounted = true;

    const handle = (url: string | null) => {
      if (!mounted) {
        return;
      }
      if (!url) {
        setAuthLink((current) => (current.status === 'pending' ? idleLink : current));
        return;
      }
      if (handledUrl.current === url) {
        return;
      }
      handledUrl.current = url;

      const link = parseAuthLink(url);
      if (link.kind === 'none') {
        setAuthLink(idleLink);
        return;
      }
      if (link.kind === 'error') {
        setAuthLink({ status: 'error', type: link.type, error: link.message });
        return;
      }
      setAuthLink({ status: 'establishing', type: link.type, error: null });
      createSessionFromRecoveryUrl(url)
        .then((established) => {
          if (mounted) {
            setAuthLink(
              established
                ? { status: 'established', type: link.type, error: null }
                : idleLink,
            );
          }
        })
        .catch((err) => {
          if (mounted) {
            setAuthLink({
              status: 'error',
              type: link.type,
              error: friendlyAuthMessage(err, 'This link is invalid or has expired.'),
            });
          }
        });
    };

    const latest = Linking.getLinkingURL();
    if (latest) {
      handle(latest);
    } else {
      Linking.getInitialURL().then(handle, () => handle(null));
    }
    const subscription = Linking.addEventListener('url', (event) => handle(event.url));

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, initializing, authLink }}>
      {children}
    </AuthContext.Provider>
  );
}
