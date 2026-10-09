import type { ReactNode } from 'react';

import { AppHeader } from '@/components/ui/AppHeader';

// Structural slices of React Navigation's header props - enough to render
// the shared header without importing the navigator packages directly.
type HeaderOptions = {
  title?: string;
  headerTitle?: string | ((props: { children: string; tintColor?: string }) => ReactNode);
  headerTitleStyle?: { fontSize?: number } | unknown;
  headerRight?: (props: { tintColor?: string; canGoBack: boolean }) => ReactNode;
  headerBackVisible?: boolean;
  /** "Library" / "Book": when set, the header shows "‹ Label" and the screen owns its title (D-093). */
  headerBackTitle?: string;
};

function titleSizeFrom(options: HeaderOptions): number | undefined {
  const style = options.headerTitleStyle;
  if (style && typeof style === 'object' && 'fontSize' in style) {
    const size = (style as { fontSize?: unknown }).fontSize;
    return typeof size === 'number' ? size : undefined;
  }
  return undefined;
}

type HeaderProps = {
  options: HeaderOptions;
  route: { name: string };
  navigation: { goBack: () => void; canGoBack: () => boolean };
  back?: unknown;
};

function titleFrom(options: HeaderOptions, routeName: string): string {
  if (typeof options.headerTitle === 'string') {
    return options.headerTitle;
  }
  return options.title ?? routeName;
}

/** `header` renderer for the app's native stack: detail title with back arrow. */
export function renderStackHeader(props: HeaderProps) {
  const { options, route, navigation, back } = props;
  const canGoBack = options.headerBackVisible !== false && (back != null || navigation.canGoBack());
  const backLabel = options.headerBackTitle;
  return (
    <AppHeader
      title={backLabel ? '' : titleFrom(options, route.name)}
      variant="detail"
      onBack={canGoBack ? () => navigation.goBack() : undefined}
      backLabel={backLabel}
      right={options.headerRight?.({ canGoBack })}
    />
  );
}

/** `header` renderer for the tab navigator: large title, no back arrow. */
export function renderTabHeader(props: HeaderProps) {
  const { options, route } = props;
  return (
    <AppHeader
      title={titleFrom(options, route.name)}
      variant="large"
      titleSize={titleSizeFrom(options)}
      right={options.headerRight?.({ canGoBack: false })}
    />
  );
}
