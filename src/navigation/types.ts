/**
 * src/navigation/types.ts
 *
 * Typed navigation. Every screen and its params live here, so `navigation.navigate`
 * and `route.params` are checked at compile time — a typo in a screen name or a
 * missing param is a build error, not a runtime crash.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Which end of the trip a place-search is choosing. */
export type SearchField = 'pickup' | 'drop';

/** The authenticated app stack. */
export type AppStackParamList = {
  Home: undefined;
  PlaceSearch: { field: SearchField };
  FareOptions: undefined;
  Trip: { bookingId: string };
  Trips: undefined;
  Profile: undefined;
};

/** The unauthenticated stack. */
export type AuthStackParamList = {
  Welcome: undefined;
  Register: undefined;
  // Login can be opened with a phone pre-filled (e.g. straight after registering).
  Login: { phone?: string } | undefined;
};

/** Per-screen prop helpers — auth. */
export type WelcomeScreenProps = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;
export type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/** Per-screen prop helpers — app. */
export type HomeScreenProps = NativeStackScreenProps<AppStackParamList, 'Home'>;
export type PlaceSearchScreenProps = NativeStackScreenProps<AppStackParamList, 'PlaceSearch'>;
export type FareOptionsScreenProps = NativeStackScreenProps<AppStackParamList, 'FareOptions'>;
export type TripScreenProps = NativeStackScreenProps<AppStackParamList, 'Trip'>;
export type TripsScreenProps = NativeStackScreenProps<AppStackParamList, 'Trips'>;
export type ProfileScreenProps = NativeStackScreenProps<AppStackParamList, 'Profile'>;