import { useEffect, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  View,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * The keyboard-safe screen pane.
 *
 * iOS keeps KeyboardAvoidingView's padding behavior. Android under SDK 54's
 * enforced edge-to-edge no longer resizes the window for the soft keyboard,
 * which left anchored composers and form fields covered while typing - so
 * here the true overlap is measured from the keyboard's top edge against the
 * window and padded away. On a device that does still resize its layout the
 * measured overlap is zero and the pane stays inert.
 */
export function KeyboardPane({
  style,
  keyboardVerticalOffset,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  /** iOS only: fixed header height to subtract, as with KeyboardAvoidingView. */
  keyboardVerticalOffset?: number;
  children: ReactNode;
}) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const onShow = (event: KeyboardEvent) => {
      const windowHeight = Dimensions.get('window').height;
      const keyboardTop = event.endCoordinates?.screenY ?? windowHeight;
      setInset(Math.max(0, Math.round(windowHeight - keyboardTop)));
    };
    const onHide = () => setInset(0);
    const show = Keyboard.addListener('keyboardDidShow', onShow);
    const hide = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        style={style}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <View style={[style, inset > 0 ? { paddingBottom: inset } : null]}>{children}</View>;
}
