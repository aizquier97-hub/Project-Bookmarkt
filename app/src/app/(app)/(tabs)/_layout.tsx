import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors, fonts, gold } from '@/lib/theme';

// Bottom tabs (D-040): the primary-destination pattern every reading app in
// this space uses (StoryGraph, Goodreads, Fable, Kindle). Profile (Reading
// Fitness, streaks, trophies - the Strava-style home, D-064) is the landing
// tab; Library sits beside it. Quotes joined the bar in D-062 and QR
// bookmarks moved under Settings. The walnut frame (D-054) makes the chrome
// read as the bookcase around the paper surfaces.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.walnut },
        headerTintColor: colors.onWalnut,
        headerTitleStyle: { fontWeight: '700', fontFamily: fonts.serif },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: gold.base,
        tabBarInactiveTintColor: colors.onWalnutMuted,
        tabBarStyle: {
          backgroundColor: colors.walnut,
          borderTopColor: colors.walnutBorder,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', fontFamily: fonts.serif },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          title: 'Quotes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbox-ellipses-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="club"
        options={{
          title: 'Book Club',
          tabBarLabel: 'Club',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          title: 'Cue Cards',
          tabBarLabel: 'Cards',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
