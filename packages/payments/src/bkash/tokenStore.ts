// In-memory TokenStore — the default for tests and a reference impl. The app
// supplies a Redis-backed TokenStore (key bkash:token:{tenant}) in production;
// this one keeps tokens in a Map with wall-clock expiry.
import type { TokenStore } from "../types";

interface Entry {
  value: string;
  expiresAt: number; // epoch ms
}

export class MemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, Entry>();

  async get(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.map.get(key);
    if (entry && Date.now() < entry.expiresAt) return false;
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }
}
