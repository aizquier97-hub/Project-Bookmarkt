import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { renderTabHeader } from '@/components/ui/navigationHeaders';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { colors, fonts, gold } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Bottom tabs (D-040): the primary-destination pattern every reading app in
// this space uses (StoryGraph, Goodreads, Fable, Kindle). Profile (Reading
// Fitness, streaks, trophies - the Strava-style home, D-064) is the landing
// tab; Library sits beside it. Quotes joined the bar in D-062 and QR
// bookmarks moved under Settings. D-089 moved the bar onto parchment: the
// active destination is russet with a short antique-gold underline.
function tabIcon(name: IconName) {
  return function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return (
      <View style={styles.iconWrap}>
        <Ionicons name={name} size={24} color={color} />
        <View style={[styles.underline, focused && styles.underlineActive]} />
      </View>
    );
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        header: renderTabHeader,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.sansMedium },
      }}
      // Which tabs readers actually visit (D-086): the tab's route name only.
      screenListeners={({ route }) => ({
        focus: () => {
          trackAnalyticsEvent('tab_viewed', { tab: route.name });
        },
      })}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-circle-outline') }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: 'Library', tabBarIcon: tabIcon('library-outline') }}
      />
      <Tabs.Screen
        name="quotes"
        options={{ title: 'Quotes', tabBarIcon: tabIcon('chatbox-ellipses-outline') }}
      />
      <Tabs.Screen
        name="club"
        options={{
          title: 'Book Club',
          tabBarLabel: 'Club',
          tabBarIcon: tabIcon('people-outline'),
        }}
      />
      <Tabs.Screen
        name="recall"
        options={{ title: 'Recall', tabBarIcon: tabIcon('extension-puzzle-outline') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon('settings-outline') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', gap: 3 },
  underline: { width: 16, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  underlineActive: { backgroundColor: gold.base },
});
