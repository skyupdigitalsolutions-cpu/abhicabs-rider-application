/**
 * App.tsx  — cold-start-optimized
 *
 * Cold-start levers applied here:
 *   1. Map-heavy screens are lazy-loaded (React.lazy) so react-native-maps is
 *      not parsed/evaluated during boot — it loads when a map screen is first
 *      opened. Light screens (Welcome/Login/Home/PlaceSearch) stay eager for an
 *      instant first paint.
 *   2. The native splash screen is held until the session bootstrap resolves,
 *      then hidden — no white flash, no bare ActivityIndicator gate.
 *   3. socket.io-client is dynamically imported inside the authed effect, so its
 *      ~2.9 MB is kept off the launch bundle path (guests never load it).
 */

import { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, type AppStateStatus, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { queryClient } from './src/query/client';
import { useSession, initSessionBridge } from './src/store/session';

// --- EAGER: light screens on the first-paint path (no maps, tiny) -----------
import { WelcomeScreen } from './src/features/auth/screens/WelcomeScreen';
import { RegisterScreen } from './src/features/auth/screens/RegisterScreen';
import { LoginScreen } from './src/features/auth/screens/LoginScreen';
import { HomeScreen } from './src/features/booking/screens/HomeScreen';
import { PlaceSearchScreen } from './src/features/booking/screens/PlaceSearchScreen';

// --- LAZY: map-heavy / later screens (keep react-native-maps off the boot path)
const FareOptionsScreen = lazy(() =>
  import('./src/features/booking/screens/FareOptionsScreen').then((m) => ({ default: m.FareOptionsScreen })),
);
const PickOnMapScreen = lazy(() =>
  import('./src/features/booking/screens/PickOnMapScreen').then((m) => ({ default: m.PickOnMapScreen })),
);
const TripScreen = lazy(() =>
  import('./src/features/trip/screens/TripScreen').then((m) => ({ default: m.TripScreen })),
);
const TripsScreen = lazy(() =>
  import('./src/features/trip/screens/TripsScreen').then((m) => ({ default: m.TripsScreen })),
);
const ProfileScreen = lazy(() =>
  import('./src/features/profile/screens/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
);

import type { AppStackParamList, AuthStackParamList } from './src/navigation/types';
import { colors } from './src/theme';

// Keep the native splash up until we've decided authed vs guest.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Wire the client<->session bridge exactly once, at module load, before render.
initSessionBridge();

const AppStack = createNativeStackNavigator<AppStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

/** Shown only while a lazy screen's chunk is evaluating (usually <1 frame). */
function ScreenFallback() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

function AuthedNavigator() {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <AppStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <AppStack.Screen name="PlaceSearch" component={PlaceSearchScreen} options={{ title: 'Search', presentation: 'card' }} />
      <AppStack.Screen name="PickOnMap" component={PickOnMapScreen} options={{ title: 'Pick on map' }} />
      <AppStack.Screen name="FareOptions" component={FareOptionsScreen} options={{ title: 'Choose ride' }} />
      <AppStack.Screen name="Trip" component={TripScreen} options={{ title: 'Your trip', headerBackVisible: true }} />
      <AppStack.Screen name="Trips" component={TripsScreen} options={{ title: 'Your trips' }} />
      <AppStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Account' }} />
    </AppStack.Navigator>
  );
}

function GuestNavigator() {
  return (
    <AuthStack.Navigator
      initialRouteName="Welcome"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
    >
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} options={{ headerShown: true, title: '', headerShadowVisible: false, headerTintColor: colors.text }} />
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: true, title: '', headerShadowVisible: false, headerTintColor: colors.text }} />
    </AuthStack.Navigator>
  );
}

function RootNavigator() {
  const status = useSession((s) => s.status);
  // While 'loading', the NATIVE splash is still visible (we haven't hidden it),
  // so rendering null here is invisible — no flash.
  if (status === 'loading') return null;
  return status === 'authed' ? <AuthedNavigator /> : <GuestNavigator />;
}

export default function App() {
  const bootstrap = useSession((s) => s.bootstrap);
  const status = useSession((s) => s.status);
  const appState = useRef(AppState.currentState);

  // Restore session on cold start.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Once we know authed vs guest, hide the native splash — the real UI is ready.
  const onLayoutRootView = useCallback(async () => {
    if (status !== 'loading') {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [status]);

  // Socket lifecycle: only connect while authed AND foregrounded. The socket
  // module (socket.io-client, ~2.9 MB) is DYNAMICALLY imported here so it never
  // enters the cold-start path — guests and the first paint never pay for it.
  useEffect(() => {
    if (status !== 'authed') return;

    let cancelled = false;
    const withSocket = (fn: (m: typeof import('./src/realtime/socket')) => void) =>
      import('./src/realtime/socket').then((m) => { if (!cancelled) fn(m); }).catch(() => {});

    withSocket(({ connectSocket }) => connectSocket());

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appState.current.match(/inactive|background/);
      if (wasBackground && next === 'active') {
        withSocket(({ connectSocket }) => connectSocket());
      } else if (next.match(/inactive|background/)) {
        withSocket(({ disconnectSocket }) => disconnectSocket());
      }
      appState.current = next;
    });

    return () => {
      cancelled = true;
      sub.remove();
      import('./src/realtime/socket').then(({ disconnectSocket }) => disconnectSocket()).catch(() => {});
    };
  }, [status]);

  return (
    <View style={styles.root} onLayout={onLayoutRootView}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Suspense fallback={<ScreenFallback />}>
            <RootNavigator />
          </Suspense>
        </NavigationContainer>
      </QueryClientProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});