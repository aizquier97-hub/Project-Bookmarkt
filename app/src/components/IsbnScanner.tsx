// Guarded ISBN barcode scanner (D-028, hardened D-030): expo-camera only
// exists in native builds that include it. Requiring it on an older binary
// makes the module loader report a FATAL error directly to the global
// handler - try/catch around the require cannot stop it and the app dies
// (the standalone add-book crash). So we first probe the native registry
// with requireOptionalNativeModule, which returns null instead of throwing,
// and only require('expo-camera') when the native side is really there.

import { Ionicons } from '@expo/vector-icons';
import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/lib/theme';

interface BarcodeScanEvent {
  data?: string;
}

interface CameraApi {
  CameraView: React.ComponentType<{
    style?: object;
    facing?: 'back' | 'front';
    barcodeScannerSettings?: { barcodeTypes: string[] };
    onBarcodeScanned?: (event: BarcodeScanEvent) => void;
  }>;
  useCameraPermissions: () => [
    { granted: boolean; canAskAgain: boolean } | null,
    () => Promise<{ granted: boolean }>,
  ];
}

let cachedApi: CameraApi | null | undefined;

function getCameraApi(): CameraApi | null {
  if (cachedApi !== undefined) {
    return cachedApi;
  }
  try {
    // Ask the native side first; never evaluate expo-camera's JS (whose
    // module factory throws fatally) unless the native module exists.
    if (!requireOptionalNativeModule('ExpoCamera')) {
      cachedApi = null;
      return cachedApi;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('expo-camera') as Partial<CameraApi>;
    cachedApi = api.CameraView && api.useCameraPermissions ? (api as CameraApi) : null;
  } catch {
    cachedApi = null;
  }
  return cachedApi;
}

export function isBarcodeScannerAvailable(): boolean {
  return getCameraApi() !== null;
}

interface IsbnScannerProps {
  visible: boolean;
  onScanned: (isbnDigits: string) => void;
  onClose: () => void;
}

/**
 * Full-screen scan sheet: point the camera at the EAN-13 barcode on the
 * back cover. Fires onScanned once per open with the raw digits.
 */
export function IsbnScanner({ visible, onScanned, onClose }: IsbnScannerProps) {
  const api = getCameraApi();
  if (!api || !visible) {
    return null;
  }
  return <ScannerSheet api={api} onScanned={onScanned} onClose={onClose} />;
}

function ScannerSheet({
  api,
  onScanned,
  onClose,
}: {
  api: CameraApi;
  onScanned: (isbnDigits: string) => void;
  onClose: () => void;
}) {
  const { CameraView } = api;
  const [permission, requestPermission] = api.useCameraPermissions();
  const firedRef = useRef(false);
  const [denied, setDenied] = useState(false);
  // Edge-to-edge Android: keep Cancel above the system navigation buttons.
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (permission && !permission.granted && !denied) {
      void requestPermission().then((result) => {
        if (!result.granted) {
          setDenied(true);
        }
      });
    }
  }, [permission, requestPermission, denied]);

  const handleScan = (event: BarcodeScanEvent) => {
    const digits = String(event.data ?? '').trim();
    if (!digits || firedRef.current) {
      return;
    }
    firedRef.current = true;
    onScanned(digits);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
            onBarcodeScanned={handleScan}
          />
        ) : (
          <View style={styles.permissionBox}>
            <Ionicons name="camera-outline" size={34} color="#fffdf6" />
            <Text style={styles.permissionText}>
              {denied
                ? 'Camera access is off. You can still type the ISBN below the title field.'
                : 'Asking for camera access…'}
            </Text>
          </View>
        )}

        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>Point at the barcode on the back cover</Text>
        </View>

        <Pressable
          style={[styles.closeButton, { bottom: insets.bottom + 32 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close the scanner"
        >
          <Ionicons name="close" size={22} color="#fffdf6" />
          <Text style={styles.closeText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1d1710',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 250,
    height: 130,
    borderWidth: 2,
    borderColor: 'rgba(255, 253, 246, 0.9)',
    borderRadius: 14,
  },
  hint: {
    fontFamily: fonts.serif,
    color: '#fffdf6',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 5,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  permissionText: {
    fontFamily: fonts.serif,
    color: '#fffdf6',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  closeText: {
    fontFamily: fonts.serif,
    color: '#fffdf6',
    fontWeight: '700',
    fontSize: 15,
  },
});
