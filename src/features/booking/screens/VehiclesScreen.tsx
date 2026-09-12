/**
 * src/features/booking/screens/VehiclesScreen.tsx
 *
 * The full fleet, reached from "View all" on the home screen.
 *
 * Read-only on purpose. Tapping a vehicle does NOT start a booking: the fare
 * a rider is offered depends on the route, the time and the trip type, none of
 * which exist yet at this point. Letting them "pick an SUV" here would imply a
 * commitment the quote step might not honour — availability and price are
 * decided on the Choose ride screen, against a real route.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { VEHICLES } from '../../../config/vehicles';
import { VehicleCard } from '../components/ExploreVehicles';
import type { VehiclesScreenProps } from '../../../navigation/types';
import { colors, spacing, type } from '../../../theme';

export function VehiclesScreen(_props: VehiclesScreenProps) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Every vehicle in the ABHICABS fleet. Prices depend on your route and timing — pick a
        vehicle once you have entered your trip.
      </Text>

      {VEHICLES.map((v) => (
        <View key={v.key} style={styles.row}>
          <VehicleCard vehicle={v} wide />
          <Text style={styles.detail}>{v.detail}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.text },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  intro: {
    ...type.body,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: spacing.xs,
  },
  row: { gap: spacing.sm },
  detail: {
    ...type.caption,
    color: 'rgba(255,255,255,0.6)',
    paddingHorizontal: spacing.xs,
  },
});