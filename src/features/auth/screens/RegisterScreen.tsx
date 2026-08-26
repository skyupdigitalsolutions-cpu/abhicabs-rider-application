/**
 * src/features/auth/screens/RegisterScreen.tsx
 *
 * Account creation. Collects the four fields the backend requires (name, email,
 * phone, password) and validates them against the SAME rules the server enforces
 * so the user sees problems inline instead of as a round-trip 400.
 *
 * On success we do NOT sign the user in. The product flow is register -> OTP
 * login: we route to the Login screen with the phone pre-filled, so the user
 * confirms the number they'll sign in with going forward.
 */

import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRegister } from '../api';
import { AbhiApiError } from '../../../types/api';
import type { RegisterScreenProps } from '../../../navigation/types';
import { colors, radius, spacing, type } from '../../../theme';

// Mirror the backend validators exactly (src/validators/schemas.js).
const RULES = {
  name: (v: string) => (v.trim().length >= 2 ? null : 'Enter your full name.'),
  email: (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Enter a valid email address.'),
  phone: (v: string) => (/^\d{10}$/.test(v) ? null : 'Enter a 10-digit mobile number.'),
  password: (v: string) => {
    if (v.length < 8) return 'At least 8 characters.';
    if (!/[a-z]/.test(v)) return 'Include a lowercase letter.';
    if (!/[A-Z]/.test(v)) return 'Include an uppercase letter.';
    if (!/[0-9]/.test(v)) return 'Include a number.';
    return null;
  },
};

function serverError(err: unknown): string {
  if (err instanceof AbhiApiError) {
    if (err.code === 'EMAIL_TAKEN') return 'An account with that email already exists. Try signing in.';
    if (err.code === 'VALIDATION_ERROR') return 'Please check your details and try again.';
    if (err.code === 'RATE_LIMITED') return 'Too many attempts. Please wait a minute.';
    return err.isNetwork ? 'No connection. Check your network and retry.' : err.message;
  }
  return 'Something went wrong. Please try again.';
}

export function RegisterScreen({ navigation }: RegisterScreenProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const register = useRegister();

  const errors = {
    name: RULES.name(name),
    email: RULES.email(email),
    phone: RULES.phone(phone),
    password: RULES.password(password),
  };
  const formValid = !errors.name && !errors.email && !errors.phone && !errors.password;

  const markTouched = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  async function onSubmit() {
    setTouched({ name: true, email: true, phone: true, password: true });
    if (!formValid) return;

    register.mutate(
      { name: name.trim(), email: email.trim(), phone, password },
      {
        onSuccess: () => {
          // Registered — now sign in by OTP, with the phone pre-filled.
          navigation.replace('Login', { phone });
        },
      }
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>It takes less than a minute.</Text>
        </View>

        <Field
          label="Full name"
          value={name}
          onChangeText={setName}
          onBlur={() => markTouched('name')}
          placeholder="Your name"
          autoCapitalize="words"
          error={touched.name ? errors.name : null}
        />

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          onBlur={() => markTouched('email')}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={touched.email ? errors.email : null}
        />

        {/* Phone with +91 prefix */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Mobile number</Text>
          <View style={[styles.phoneRow, touched.phone && errors.phone ? styles.inputError : null]}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
              onBlur={() => markTouched('phone')}
              placeholder="98765 43210"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          {touched.phone && errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
        </View>

        {/* Password with show/hide */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Password</Text>
          <View style={[styles.phoneRow, touched.password && errors.password ? styles.inputError : null]}>
            <TextInput
              style={styles.phoneInput}
              value={password}
              onChangeText={setPassword}
              onBlur={() => markTouched('password')}
              placeholder="Create a password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8}>
              <Text style={styles.showToggle}>{showPw ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {touched.password && errors.password ? (
            <Text style={styles.errorText}>{errors.password}</Text>
          ) : (
            <Text style={styles.hint}>8+ chars, with an uppercase letter and a number.</Text>
          )}
        </View>

        {register.error ? <Text style={styles.serverError}>{serverError(register.error)}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (!formValid || register.isPending) && styles.buttonDisabled,
            pressed && formValid && !register.isPending && styles.buttonPressed,
          ]}
          disabled={!formValid || register.isPending}
          onPress={onSubmit}
        >
          {register.isPending ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </Pressable>

        <View style={styles.footerRow}>
          <Text style={styles.footerMuted}>Already have an account?</Text>
          <Pressable onPress={() => navigation.replace('Login')} hitSlop={8}>
            <Text style={styles.footerLink}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------- Field ---------------------------------- */

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  onBlur?: () => void;
  placeholder: string;
  error?: string | null;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.error ? styles.inputError : null]}
        value={props.value}
        onChangeText={props.onChangeText}
        onBlur={props.onBlur}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
      />
      {props.error ? <Text style={styles.errorText}>{props.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.sm },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.textMuted, marginTop: spacing.xs },

  fieldWrap: { gap: spacing.xs },
  label: { ...type.label, color: colors.text },
  input: {
    ...type.body, color: colors.text, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
  },
  inputError: { borderColor: colors.danger },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg,
  },
  prefix: { ...type.body, color: colors.textMuted, marginRight: spacing.sm },
  phoneInput: { ...type.body, color: colors.text, flex: 1, paddingVertical: spacing.lg },
  showToggle: { ...type.label, color: colors.primary },

  errorText: { ...type.caption, color: colors.danger },
  hint: { ...type.caption, color: colors.textMuted },
  serverError: { ...type.body, color: colors.danger, marginTop: spacing.xs },

  button: {
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.lg,
    alignItems: 'center', marginTop: spacing.sm,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: colors.surfaceAlt },
  buttonText: { ...type.label, color: colors.primaryText, fontSize: 16 },

  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md },
  footerMuted: { ...type.body, color: colors.textMuted },
  footerLink: { ...type.body, color: colors.primary, fontWeight: '700' },
});