/**
 * App.tsx
 */

import { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, type AppStateStatus, StyleSheet, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { queryClient } from './src/query/client';
import { useSession, initSessionBridge } from './src/store/session';
import { connectSocket, disconnectSocket } from './src/realtime/socket';
import { WelcomeScreen } from './src/features/auth/screens/WelcomeScreen';
import { RegisterScreen } from './src/features/auth/screens/RegisterScreen';
import { LoginScreen } from './src/features/auth/screens/LoginScreen';
import { HomeScreen } from './src/features/booking/screens/HomeScreen';
import { PlaceSearchScreen } from './src/features/booking/screens/PlaceSearchScreen';
import { FareOptionsScreen } from './src/features/booking/screens/FareOptionsScreen';
import { TripScreen } from './src/features/trip/screens/TripScreen';
import type { AppStackParamList, AuthStackParamList } from './src/navigation/types';
import { colors } from './src/theme';

// Wire the client<->session bridge exactly once, at module load, before render.
initSessionBridge();

const AppStack = createNativeStackNavigator<AppStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function Splash() {
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
      <AppStack.Screen
        name="PlaceSearch"
        component={PlaceSearchScreen}
        options={{ title: 'Search', presentation: 'card' }}
      />
      <AppStack.Screen
        name="FareOptions"
        component={FareOptionsScreen}
        options={{ title: 'Choose ride' }}
      />
      <AppStack.Screen
        name="Trip"
        component={TripScreen}
        options={{ title: 'Your trip', headerBackVisible: false }}
      />
    </AppStack.Navigator>
  );
}

function GuestNavigator() {
  return (
    <AuthStack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ headerShown: true, title: '', headerShadowVisible: false, headerTintColor: colors.text }}
      />
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: true, title: '', headerShadowVisible: false, headerTintColor: colors.text }}
      />
    </AuthStack.Navigator>
  );
}

function RootNavigator() {
  const status = useSession((s) => s.status);
  if (status === 'loading') return <Splash />;
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

  // Socket lifecycle: only connect while authed AND foregrounded.
  useEffect(() => {
    if (status !== 'authed') {
      disconnectSocket();
      return;
    }
    connectSocket();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appState.current.match(/inactive|background/);
      if (wasBackground && next === 'active') {
        // Foregrounded: reconnect (socket auto-resyncs watches on connect).
        connectSocket();
      } else if (next.match(/inactive|background/)) {
        // Backgrounded: drop the socket; the OS would suspend it anyway.
        disconnectSocket();
      }
      appState.current = next;
    });

    return () => {
      sub.remove();
      disconnectSocket();
    };
  }, [status]);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});