import { useReverification } from "@clerk/react";

/**
 * Wraps a mutation function so that, if the API rejects with Clerk's
 * reverification hint (HTTP 403 + `clerk_error: { ... reverification ... }`),
 * Clerk's built-in modal prompts the user to verify (e.g. enter the email
 * code) and then automatically retries the original call.
 *
 * The original mutation hooks (axios-based) reject on non-2xx, so we catch
 * the error and re-emit the response body — that's the shape `useReverification`
 * inspects via `isReverificationHint()`.
 */
export function useStepUpAction<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  const wrapped = async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (err: any) {
      const data = err?.response?.data ?? err?.data;
      if (data && data.clerk_error) {
        return data as TResult;
      }
      throw err;
    }
  };
  const enhanced = useReverification(wrapped);
  return enhanced as (...args: TArgs) => Promise<TResult>;
}
