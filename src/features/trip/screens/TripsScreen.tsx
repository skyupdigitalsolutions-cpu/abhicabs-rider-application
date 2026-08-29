/**
 * src/features/trip/screens/TripsScreen.tsx
 *
 * Booking history. A paginated, pull-to-refresh list of the rider's own trips,
 * newest first. Tapping a row opens that trip's live/summary screen.
 */

import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useTripHistory } from '../history.api';
import type { TripsScreenProps } from '../../../navigation/types';
import type { BookingListItem, BookingStatus } from '../../../types/domain';
import { colors, radius, spacing, type } from '../../../theme';

export function TripsScreen({ navigation }: TripsScreenProps) {
  const {
    data, isLoading, isError, refetch, isRefetching,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useTripHistory();

  const trips = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text} size="large" />
        <Text style={styles.centerText}>Loading your trips…</Text>
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Couldn't load your trips.</Text>
        <Pressable onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No trips yet</Text>
        <Text style={styles.centerText}>Your booked rides will show up here.</Text>
        <Pressable onPress={() => navigation.navigate('Home')} style={styles.retryBtn}>
          <Text style={styles.retryText}>Book a ride</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={trips}
      keyExtractor={(t) => t.id}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.text} />
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
      renderItem={({ item }) => (
        <TripRow item={item} onPress={() => navigation.navigate('Trip', { bookingId: item.id })} />
      )}
      ListFooterComponent={
        isFetchingNextPage ? (
          <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.textMuted} />
        ) : null
      }
    />
  );
}

/* -------------------------------- Row -------------------------------------- */

function TripRow({ item, onPress }: { item: BookingListItem; onPress: () => void }) {
  const fare = item.finalFare ?? item.estimatedFare;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowTop}>
        <Text style={styles.bookingNo}>#{item.bookingNumber}</Text>
        <StatusTag status={item.status} />
      </View>

      <View style={styles.routeLine}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        <Text style={styles.routeText} numberOfLines={1}>{item.pickupAddress}</Text>
      </View>
      <View style={styles.routeLine}>
        <View style={[styles.dot, { backgroundColor: colors.text }]} />
        <Text style={styles.routeText} numberOfLines={1}>{item.dropAddress}</Text>
      </View>

      <View style={styles.rowBottom}>
        <Text style={styles.meta}>{formatWhen(item.pickupAt)}</Text>
        <Text style={styles.fare}>{fare ? `₹${fare}` : '—'}</Text>
      </View>
    </Pressable>
  );
}

function StatusTag({ status }: { status: BookingStatus }) {
  const done = ['COMPLETED'].includes(status);
  const dead = ['CANCELLED', 'EXPIRED'].includes(status);
  const bg = done ? colors.surfaceAlt : dead ? colors.surfaceAlt : colors.primary;
  const fg = done ? colors.text : dead ? colors.textMuted : colors.primaryText;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={{ ...type.caption, fontWeight: '600', color: fg }}>{label(status)}</Text>
    </View>
  );
}

/* -------------------------------- Helpers ---------------------------------- */

function label(s: BookingStatus): string {
  const m: Record<BookingStatus, string> = {
    ATTEMPTED: 'Processing', PENDING: 'Requested', CONFIRMED: 'Confirmed',
    ALLOCATED: 'Driver assigned', EN_ROUTE: 'Arriving', ONGOING: 'On trip',
    ARRIVED: 'Arrived', COMPLETED: 'Completed', CANCELLED: 'Cancelled', EXPIRED: 'Expired',
  };
  return m[s];
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centerText: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  emptyTitle: { ...type.title, color: colors.text },

  row: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookingNo: { ...type.label, color: colors.textMuted },
  tag: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.md },

  routeLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  routeText: { ...type.body, color: colors.text, flex: 1 },

  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  meta: { ...type.caption, color: colors.textMuted },
  fare: { ...type.label, color: colors.text },

  retryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  retryText: { ...type.label, color: colors.primaryText },
});