// Test-only stub for "next/cache". The admin dashboard helper wraps its query in
// unstable_cache; outside the Next runtime (this integration suite) we just run
// the function directly and no-op the tag APIs. This keeps the data path under
// test without pulling in the Next server runtime.
export function unstable_cache<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return fn;
}

export function revalidateTag(): void {
  /* no-op in tests */
}

export function revalidatePath(): void {
  /* no-op in tests */
}
