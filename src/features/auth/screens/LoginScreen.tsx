/**
 * src/features/auth/screens/LoginScreen.tsx
 *
 * Phone-OTP login — the primary rider sign-in. Two steps in one screen:
 * enter phone -> enter the 6-digit code. It demonstrates the full stack working
 * end to end: typed endpoint -> API client -> session store -> navigation flip.
 *
 * UX choices (from the design skill's writing guidance): buttons say exactly
 * what happens ("Send code", "Verify & continue"); errors state what went wrong
 * and what to do, in the interface's voice; the resend control shows a live
 * cooldown so the 60s server-side limit never surprises the user with a 429.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRequestOtp, useVerifyOtp } from '../api';
import { AbhiApiError } from '../../../types/api';
import type { LoginScreenProps } from '../../../navigation/types';
import { colors, radius, spacing, type } from '../../../theme';

const RESEND_COOLDOWN_SECONDS = 60; // mirrors backend OTP_RESEND_COOLDOWN
const OTP_LENGTH = 6; // mirrors backend OTP_LENGTH

function errorMessage(err: unknown): string {
  if (err instanceof AbhiApiError) {
    switch (err.code) {
      case 'INVALID_OTP':
        return "That code didn't match. Check it and try again.";
      case 'RATE_LIMITED':
        return 'Too many attempts. Wait a minute, then try again.';
      case 'SERVER_BUSY':
        return 'We are busy right now. Retrying automatically…';
      case 'VALIDATION_ERROR':
        return 'That phone number looks off. Use a 10-digit mobile number.';
      default:
        return err.isNetwork ? 'No connection. Check your network and retry.' : err.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

export function LoginScreen({ route, navigation }: LoginScreenProps) {
  // If we arrived here straight from registration, the phone is passed in and
  // pre-filled so the user only has to tap "Send code".
  const prefillPhone = route.params?.phone ?? '';
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState(prefillPhone);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && cooldownTimer.current) clearInterval(cooldownTimer.current);
        return Math.max(0, c - 1);
      });
    }, 1000);
  }

  const phoneValid = /^\d{10}$/.test(phone);
  const codeValid = new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);

  async function onSendCode() {
    requestOtp.mutate(phone, {
      onSuccess: () => {
        setStep('code');
        startCooldown();
      },
    });
  }

  async function onVerify() {
    verifyOtp.mutate({ phone, code });
    // On success, the session store flips status -> 'authed' and the root
    // navigator swaps to the app stack. No navigation call needed here.
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <Text style={styles.brand}>AbhiCabs</Text>
        <Text style={styles.tagline}>
          {step === 'phone' ? 'Sign in to book your ride' : `Enter the code we sent to +91 ${phone}`}
        </Text>
      </View>

      {step === 'phone' ? (
        <View style={styles.form}>
          <Text style={styles.label}>Mobile number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="98765 43210"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              autoFocus
              maxLength={10}
              returnKeyType="done"
            />
          </View>

          {requestOtp.error ? <Text style={styles.error}>{errorMessage(requestOtp.error)}</Text> : null}

          <PrimaryButton
            label="Send code"
            disabled={!phoneValid || requestOtp.isPending}
            loading={requestOtp.isPending}
            onPress={onSendCode}
          />

          <View style={styles.signupRow}>
            <Text style={styles.signupMuted}>New to AbhiCabs?</Text>
            <Pressable onPress={() => navigation.navigate('Register')} hitSlop={8}>
              <Text style={styles.signupLink}>Create an account</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Verification code</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
            placeholder={'•'.repeat(OTP_LENGTH)}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            autoFocus
            maxLength={OTP_LENGTH}
            textAlign="center"
          />

          {verifyOtp.error ? <Text style={styles.error}>{errorMessage(verifyOtp.error)}</Text> : null}

          <PrimaryButton
            label="Verify & continue"
            disabled={!codeValid || verifyOtp.isPending}
            loading={verifyOtp.isPending}
            onPress={onVerify}
          />

          <View style={styles.resendRow}>
            <Pressable
              disabled={cooldown > 0 || requestOtp.isPending}
              onPress={onSendCode}
              hitSlop={8}
            >
              <Text style={[styles.resend, cooldown > 0 && styles.resendDisabled]}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setStep('phone')} hitSlop={8}>
              <Text style={styles.changeNumber}>Change number</Text>
            </Pressable>
          </View>
        </View>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.button,
        props.disabled && styles.buttonDisabled,
        pressed && !props.disabled && styles.buttonPressed,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={colors.primaryText} />
      ) : (
        <Text style={styles.buttonText}>{props.label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },
  header: { marginBottom: spacing.xxl },
  brand: { ...type.display, color: colors.primary, marginBottom: spacing.sm },
  tagline: { ...type.body, color: colors.textMuted },
  form: { gap: spacing.md },
  label: { ...type.label, color: colors.text },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  prefix: { ...type.body, color: colors.textMuted, marginRight: spacing.sm },
  phoneInput: { ...type.body, color: colors.text, flex: 1, paddingVertical: spacing.lg },
  codeInput: {
    ...type.title,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    letterSpacing: 8,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: colors.surfaceAlt },
  buttonText: { ...type.label, color: colors.primaryText, fontSize: 16 },
  error: { ...type.caption, color: colors.danger },
  resendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  resend: { ...type.label, color: colors.primary },
  resendDisabled: { color: colors.textMuted },
  changeNumber: { ...type.label, color: colors.textMuted },
  signupRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.lg },
  signupMuted: { ...type.body, color: colors.textMuted },
  signupLink: { ...type.body, color: colors.primary, fontWeight: '700' },
});