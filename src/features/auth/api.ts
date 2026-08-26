import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints';
import { useSession } from '../../store/session';
import type { AuthResult } from '../../types/domain';

/**
 * Create an account. The backend's /auth/register returns a full session, but we
 * deliberately DON'T sign the user in here: the product flow is register -> OTP
 * login (phone pre-filled). So this hook just creates the account; the Register
 * screen then routes to the OTP login. The returned tokens are ignored.
 */
export function useRegister() {
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string; phone: string }) =>
      authApi.register(input),
  });
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (phone: string) => authApi.requestOtp(phone),
  });
}

export function useVerifyOtp() {
  const signIn = useSession((s) => s.signIn);
  return useMutation<AuthResult, unknown, { phone: string; code: string }>({
    mutationFn: ({ phone, code }) => authApi.verifyOtp(phone, code),
    onSuccess: async (result) => {
      await signIn(result);
    },
  });
}