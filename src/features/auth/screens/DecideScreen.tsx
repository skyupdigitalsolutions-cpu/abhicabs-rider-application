/**
 * src/features/auth/screens/DecideScreen.tsx
 *
 * A one-frame gate after the splash: has this device seen onboarding before?
 * First launch → Onboarding. Returning user → Welcome (sign-in choice). It
 * renders nothing meaningful; it just reads the flag and redirects, so the user
 * never sees it as a distinct screen.
 */

import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { appStorage } from '../../../lib/storage';
import { ONBOARDING_SEEN_KEY } from './OnboardingScreen';
import type { DecideScreenProps } from '../../../navigation/types';
import { colors } from '../../../theme';

export function DecideScreen({ navigation }: DecideScreenProps) {
  useEffect(() => {
    let done = false;
    (async () => {
      let seen = false;
      try { seen = (await appStorage.getItem(ONBOARDING_SEEN_KEY)) === '1'; } catch { /* default unseen */ }
      if (done) return;
      navigation.replace(seen ? 'Welcome' : 'Onboarding');
    })();
    return () => { done = true; };
  }, [navigation]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});