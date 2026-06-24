// Test-only stub for "next/headers". The auth session module (createSession /
// destroySession / getSession) reads and writes cookies via next/headers, which
// only exists inside the Next request runtime. This stub backs cookies() and
// headers() with a per-process in-memory store so the session lifecycle is
// testable end-to-end against the embedded Postgres.
//
// Tests drive it via the exported helpers: __setCookie / __clearCookies /
// __setHeaders. The store is module-global (one Vitest worker per file), which
// matches a single simulated request at a time.
interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAge?: number;
  domain?: string;
}

interface CookieEntry {
  name: string;
  value: string;
  options: CookieOptions;
}

const cookieStore = new Map<string, CookieEntry>();
let headerStore = new Headers();

const cookieJar = {
  get(name: string): { name: string; value: string } | undefined {
    const e = cookieStore.get(name);
    return e ? { name: e.name, value: e.value } : undefined;
  },
  getAll(): { name: string; value: string }[] {
    return [...cookieStore.values()].map((e) => ({ name: e.name, value: e.value }));
  },
  set(name: string, value: string, options: CookieOptions = {}): void {
    if (options.maxAge === 0 || value === "") {
      cookieStore.delete(name);
      return;
    }
    cookieStore.set(name, { name, value, options });
  },
  delete(name: string): void {
    cookieStore.delete(name);
  },
};

export async function cookies(): Promise<typeof cookieJar> {
  return cookieJar;
}

export async function headers(): Promise<Headers> {
  return headerStore;
}

// --- test helpers ---
export function __setCookie(name: string, value: string): void {
  cookieStore.set(name, { name, value, options: {} });
}

export function __getCookie(name: string): string | undefined {
  return cookieStore.get(name)?.value;
}

export function __clearCookies(): void {
  cookieStore.clear();
}

export function __setHeaders(init: Record<string, string>): void {
  headerStore = new Headers(init);
}
