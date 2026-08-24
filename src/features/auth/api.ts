import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api/endpoints';
import { useSession } from '../../store/session';
import type { AuthResult } from '../../types/domain';

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