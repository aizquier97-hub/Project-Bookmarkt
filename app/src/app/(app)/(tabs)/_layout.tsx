import { Tabs } from 'expo-router';
import { Library, Puzzle, Quote, Settings, User, Users, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { renderTabHeader } from '@/components/ui/navigationHeaders';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { colors, fonts, gold } from '@/lib/theme';

// Bottom tabs (D-040): the primary-destination pattern every reading app in
// this space uses (StoryGraph, Goodreads, Fable, Kindle). Profile (Reading
// Fitness, streaks, trophies - the Strava-style home, D-064) is the landing
// tab; Library sits beside it. Quotes joined the bar in D-062 and QR
// bookmarks moved under Settings. D-089 moved the bar onto parchment; D-090
// swapped the icons for thin-line Lucide glyphs after the Figma reference and
// put the antique-gold underline beneath the active label. D-091 set the bar
// on walnut, as the Figma crop shows: parchment glyphs at rest, gold when
// active, the underline in the same gold.
function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ color }: { color: string }) {
    return <Icon size={22} color={color} strokeWidth={1.6} />;
  };
}

function tabLabel({
  focused,
  color,
  children,
}: {
  focused: boolean;
  color: string;
  children: string;
}) {
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color }, focused && styles.labelActive]} numberOfLines={1}>
        {children}
      </Text>
      <View style={[styles.underline, focused && styles.underlineActive]} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        header: renderTabHeader,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: gold.base,
        tabBarInactiveTintColor: colors.onWalnut,
        // Bar content is 52pt (D-092: icon 22 + label 14 + underline 2 +
        // breathing room) over the system inset; on Android's 3-button
        // navigation that inset is walnut too, so the bar itself stays lean.
        tabBarStyle: {
          backgroundColor: colors.walnut,
          borderTopColor: colors.walnutBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 52 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom,
        },
        tabBarItemStyle: { paddingVertical: 0, gap: 0 },
        tabBarLabel: tabLabel,
      }}
      // Which tabs readers actually visit (D-086): the tab's route name only.
      screenListeners={({ route }) => ({
        focus: () => {
          trackAnalyticsEvent('tab_viewed', { tab: route.name });
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Profile', tabBarIcon: tabIcon(User) }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: tabIcon(Library) }} />
      <Tabs.Screen name="quotes" options={{ title: 'Quotes', tabBarIcon: tabIcon(Quote) }} />
      <Tabs.Screen
        name="club"
        options={{ title: 'Book Club', tabBarLabel: 'Club', tabBarIcon: tabIcon(Users) }}
      />
      <Tabs.Screen name="recall" options={{ title: 'Recall', tabBarIcon: tabIcon(Puzzle) }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon(Settings) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  labelWrap: { alignItems: 'center', gap: 2 },
  label: { fontSize: 11, lineHeight: 14, fontFamily: fonts.sansMedium },
  labelActive: { fontFamily: fonts.sansSemiBold },
  underline: { width: 18, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  underlineActive: { backgroundColor: gold.base },
});
