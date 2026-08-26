/**
 * src/features/auth/screens/WelcomeScreen.tsx
 *
 * The first screen a new or signed-out user sees. It does one job: offer the two
 * ways in — create an account, or sign in — without deciding for them. Keeping
 * this a distinct screen (rather than defaulting straight into a form) means a
 * returning user isn't dropped into a registration flow, and a new user isn't
 * dropped into an OTP screen for a phone that isn't registered yet.
 */

import { StyleSheet, Text, View, Pressable } from 'react-native';
import type { WelcomeScreenProps } from '../../../navigation/types';
import { colors, radius, spacing, type } from '../../../theme';

export function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  return (
    <View style={styles.root}>
      {/* Brand block */}
      <View style={styles.brandBlock}>
        <View style={styles.logoMark}>
          <Text style={styles.logoGlyph}>🚕</Text>
        </View>
        <Text style={styles.brand}>AbhiCabs</Text>
        <Text style={styles.tagline}>Rides across the city, booked in seconds.</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={styles.primaryText}>Create an account</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.secondaryText}>I already have an account</Text>
        </Pressable>

        <Text style={styles.legal}>
          By continuing you agree to our Terms and Privacy Policy.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'space-between' },
  brandBlock: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: spacing.md },
  logoMark: {
    width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  logoGlyph: { fontSize: 38 },
  brand: { ...type.display, fontSize: 40, color: colors.text },
  tagline: { ...type.body, color: colors.textMuted, maxWidth: 260 },

  actions: { gap: spacing.md, paddingBottom: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center',
  },
  primaryText: { ...type.label, color: colors.primaryText, fontSize: 16 },
  secondaryBtn: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center',
  },
  secondaryText: { ...type.label, color: colors.text, fontSize: 16 },
  pressed: { opacity: 0.85 },
  legal: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});