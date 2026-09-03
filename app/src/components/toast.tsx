import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/lib/theme';

/**
 * Shared in-app notification system (roadmap §11 "replace developer-facing
 * alerts with a shared notification system"). One toast at a time, bottom of
 * the screen, auto-dismissing; confirmations stay native dialogs.
 */

type ToastTone = 'success' | 'error' | 'info';

/** Optional tappable action (Material snackbar pattern) - e.g. Undo. */
type ToastAction = { label: string; onPress: () => void };

type ToastApi = {
  showToast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastApi>({ showToast: () => undefined });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const TOAST_DURATION_MS = 3200;
// Toasts with an action linger longer so the reader can actually tap it.
const TOAST_ACTION_DURATION_MS = 5200;

const toneColors: Record<ToastTone, string> = {
  success: colors.accent,
  error: colors.danger,
  info: colors.text,
};

export function ToastProvider({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{
    message: string;
    tone: ToastTone;
    id: number;
    action?: ToastAction;
  } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info', action?: ToastAction) => {
      setToast({ message, tone, action, id: Date.now() });
    },
    [],
  );

  useEffect(() => {
    if (!toast) {
      return;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) {
            setToast(null);
          }
        },
      );
    }, toast.action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS);
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [toast, opacity]);

  const api = useMemo(() => ({ showToast }), [showToast]);

  const handleAction = () => {
    if (!toast?.action) {
      return;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    toast.action.onPress();
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) {
          setToast(null);
        }
      },
    );
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents={toast.action ? 'box-none' : 'none'}
          style={[
            styles.toast,
            { opacity, bottom: insets.bottom + 24, borderLeftColor: toneColors[toast.tone] },
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
          {toast.action ? (
            <Pressable
              onPress={handleAction}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
            >
              <Text style={styles.actionText}>{toast.action.label}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  toastText: {
    fontFamily: fonts.serif,
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  actionText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
