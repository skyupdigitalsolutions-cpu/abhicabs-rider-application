/**
 * src/features/profile/screens/ProfileScreen.tsx
 *
 * The rider's account screen: who they are, a shortcut into trip history, and
 * sign out. Kept intentionally small — it is a hub, not a settings suite.
 */

import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../../store/session';
import type { ProfileScreenProps } from '../../../navigation/types';
import { colors, radius, spacing, type } from '../../../theme';

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const user = useSession((s) => s.user);
  const signOut = useSession((s) => s.signOut);
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut({ revokeOnServer: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? '?').trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name ?? 'Rider'}</Text>
        {user?.phone ? <Text style={styles.sub}>{user.phone}</Text> : null}
        {user?.email && !user.email.includes('placeholder') ? (
          <Text style={styles.sub}>{user.email}</Text>
        ) : null}
      </View>

      <Pressable style={styles.item} onPress={() => navigation.navigate('Trips')}>
        <Text style={styles.itemText}>Your trips</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={() => navigation.navigate('Home')}>
        <Text style={styles.itemText}>Book a ride</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Pressable style={styles.signOut} onPress={onSignOut} disabled={signingOut}>
        {signingOut ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={styles.signOutText}>Sign out</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },

  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.xs,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  avatarText: { ...type.display, color: colors.primaryText },
  name: { ...type.title, color: colors.text },
  sub: { ...type.body, color: colors.textMuted },

  item: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  itemText: { ...type.body, color: colors.text },
  chevron: { ...type.title, color: colors.textMuted },

  signOut: {
    borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.md,
  },
  signOutText: { ...type.label, color: colors.danger },
});