// app/(tabs)/_layout.tsx
// Role-aware tab navigator. STUDENT gets the field-capture tabs (Discover /
// My Entries / Propose / Progress); PARENT gets a single read-only dashboard
// tab — see app/(tabs)/parent-dashboard.tsx for why mobile only shows a lean
// summary rather than the full web dashboard. HOMESCHOOL mirrors TEACHER's
// Dashboard + Live Tracking tabs (backend/routes/homeschool.py already
// documents "Homeschool parent = teacher + parent in one account", and
// every teacher endpoint — get_current_teacher dependency, plus
// ownership-filtered queries in activities.py — already accepts HOMESCHOOL),
// plus one extra tab TEACHER doesn't get: homeschool-dashboard.tsx's
// per-child progress cards, since tracking individual kids is genuinely
// unique to this role. Settings is universal.
//
// expo-router auto-registers every file under (tabs)/ as a tab unless
// explicitly hidden via `href: null` — that's how a signed-out-of-role tab
// stays mounted (so navigating to it directly doesn't 404) without showing
// in the bar. All non-Settings screens are always registered; only which
// ones show for the current role changes.

import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/stores/AuthContext';
import { fetchOnboardingStatus } from '@/src/api/onboarding';

function TabIcon({ emoji, size }: { emoji: string; size: number }) {
  return <Text style={{ fontSize: size * 0.75, lineHeight: size }}>{emoji}</Text>;
}

export default function TabLayout() {
  const { theme } = useTheme();
  // useTranslation subscribes this component to i18next's `languageChanged`
  // event — without it, Tabs.Screen `title` options are computed once at
  // mount and never recomputed on a runtime language switch (tab labels
  // silently stayed in whatever language was active on cold boot).
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role ?? 'STUDENT';
  const isStudent = role === 'STUDENT';
  const isTeacher = role === 'TEACHER';
  const isParent = role === 'PARENT';
  const isHomeschool = role === 'HOMESCHOOL';

  // First-run wizard gate, HOMESCHOOL only (app/homeschool-welcome.tsx,
  // mirroring web's HomeschoolWelcomePage.tsx). GET /onboarding/status'
  // `dismissed` flag lives on the organizations row, shared with web, so
  // this only ever fires once across both platforms. Reached here (rather
  // than the global AuthGuard in app/_layout.tsx) to keep that already
  // carefully-tuned redirect logic untouched — this check is self-contained
  // and only affects HOMESCHOOL accounts; every other role renders
  // immediately with no extra round-trip.
  const [onboardChecked, setOnboardChecked] = useState(!isHomeschool);
  useEffect(() => {
    if (!isHomeschool) { setOnboardChecked(true); return; }
    let cancelled = false;
    fetchOnboardingStatus()
      .then((s) => { if (!cancelled && !s.dismissed) router.replace('/homeschool-welcome'); })
      .catch(() => { /* fail open — don't block the dashboard on a network error */ })
      .finally(() => { if (!cancelled) setOnboardChecked(true); });
    return () => { cancelled = true; };
  }, [isHomeschool]);

  // href:null hides a tab from the BAR but doesn't change which screen the
  // navigator mounts first — that's still whichever route is first in
  // registration order (index) unless told otherwise. Without this, a
  // teacher/parent/homeschool account would land on the hidden Discover
  // screen's content with no tab in the bar showing as active. Keyed by
  // role so switching accounts (logout/login as a different role) re-picks
  // the right initial tab instead of reusing a stale navigator instance.
  const initialRouteName = (isTeacher || isHomeschool) ? 'teacher-dashboard' : isParent ? 'parent-dashboard' : 'index';

  if (!onboardChecked) return null;

  return (
    <Tabs
      key={role}
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textFaint,
        tabBarLabelStyle: { fontFamily: theme.fontBody, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ href: isStudent ? undefined : null, title: t('tabs.discover', 'Discover'), tabBarButtonTestID: 'tab-discover', tabBarIcon: ({ size }) => <TabIcon emoji="🗺" size={size} /> }}
      />
      <Tabs.Screen
        name="journal"
        options={{ href: isStudent ? undefined : null, title: t('journal.tabLabel', 'My Entries'), tabBarButtonTestID: 'tab-journal', tabBarIcon: ({ size }) => <TabIcon emoji="📓" size={size} /> }}
      />
      <Tabs.Screen
        name="propose"
        options={{ href: isStudent ? undefined : null, title: t('tabs.propose', 'Propose'), tabBarButtonTestID: 'tab-propose', tabBarIcon: ({ size }) => <TabIcon emoji="🧭" size={size} /> }}
      />
      <Tabs.Screen
        name="progress"
        options={{ href: isStudent ? undefined : null, title: t('tabs.achievements', 'Achievements'), tabBarButtonTestID: 'tab-progress', tabBarIcon: ({ size }) => <TabIcon emoji="🌱" size={size} /> }}
      />
      <Tabs.Screen
        name="teacher-dashboard"
        options={{ href: (isTeacher || isHomeschool) ? undefined : null, title: t('teacherDashboard.tabLabel', 'Dashboard'), tabBarButtonTestID: 'tab-teacher-dashboard', tabBarIcon: ({ size }) => <TabIcon emoji="📊" size={size} /> }}
      />
      <Tabs.Screen
        name="live-tracking"
        options={{ href: (isTeacher || isHomeschool) ? undefined : null, title: t('liveTracking.tabLabel', 'Live Tracking'), tabBarButtonTestID: 'tab-live-tracking', tabBarIcon: ({ size }) => <TabIcon emoji="📡" size={size} /> }}
      />
      <Tabs.Screen
        name="parent-dashboard"
        options={{ href: isParent ? undefined : null, title: t('parentDashboard.tabLabel', 'Children'), tabBarButtonTestID: 'tab-parent-dashboard', tabBarIcon: ({ size }) => <TabIcon emoji="👨‍👩‍👧" size={size} /> }}
      />
      {/* Secondary tab, HOMESCHOOL only — per-child progress cards.
          HOMESCHOOL mirrors TEACHER's Dashboard + Live Tracking tabs above,
          but tracking individual kids is the one thing those tabs don't
          cover for this role, so it stays as an additional tab rather than
          being dropped entirely. */}
      <Tabs.Screen
        name="homeschool-dashboard"
        options={{ href: isHomeschool ? undefined : null, title: t('homeschoolDashboard.tabLabel', 'Children'), tabBarButtonTestID: 'tab-homeschool-children', tabBarIcon: ({ size }) => <TabIcon emoji="👨‍👩‍👧" size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings', 'Settings'), tabBarButtonTestID: 'tab-settings', tabBarIcon: ({ size }) => <TabIcon emoji="⚙️" size={size} /> }}
      />
      {/* explore.tsx is a Redirect-only stub kept to avoid broken imports
          elsewhere — expo-router auto-registers any file under (tabs)/ as
          a tab unless explicitly excluded, so without this entry an extra
          "explore" tab rendered alongside the intended ones (found via
          maestro/flows/navigation/2-tab-navigation.yaml's 2.5 assertions,
          which already documented this exact discrepancy). href: null
          hides it from the tab bar while leaving the route itself intact. */}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
