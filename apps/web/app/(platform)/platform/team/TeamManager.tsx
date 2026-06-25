"use client";

// Platform team roster + management (PP1-B1). Add by email, change role, remove.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { addTeamMemberAction, changeTeamRoleAction, removeTeamMemberAction } from "./actions";

type Role = "super_admin" | "support" | "sales" | "accountant" | "ops";

interface Member {
  userId: string;
  email: string;
  fullName: string | null;
  role: Role;
  assignedTenants: number;
}

const ROLES: Role[] = ["super_admin", "accountant", "support", "sales", "ops"];
const ROLE_BN: Record<Role, string> = {
  super_admin: "super-admin", accountant: "accountant", support: "support", sales: "sales", ops: "ops",
};

export function TeamManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "ব্যর্থ হয়েছে।");
      else router.refresh();
    });
  };

  const add = (fd: FormData) =>
    act(() => addTeamMemberAction(String(fd.get("email") ?? ""), String(fd.get("role") ?? "support"), String(fd.get("fullName") ?? "") || undefined));

  return (
    <div className="space-y-4">
      <form action={add} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase text-ink-muted">ইমেইল</span>
          <input name="email" type="email" required placeholder="staff@hybrid.com" className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase text-ink-muted">নাম</span>
          <input name="fullName" placeholder="ঐচ্ছিক" className="h-11 w-32 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase text-ink-muted">ভূমিকা</span>
          <select name="role" defaultValue="support" className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_BN[r]}</option>)}
          </select>
        </label>
        <Button type="submit" disabled={pending}>{pending ? "…" : "যোগ করুন"}</Button>
      </form>

      {error && <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">{error}</p>}

      <ul className="overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border">
        {members.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-ink-muted">কোনো টিম সদস্য নেই — প্রথম জনকে যোগ করুন।</li>
        ) : members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{m.fullName ?? m.email}</p>
              <p className="truncate text-xs text-ink-muted">{m.email} · {m.assignedTenants} টেন্যান্ট</p>
            </div>
            <select
              value={m.role}
              disabled={pending}
              onChange={(e) => act(() => changeTeamRoleAction(m.userId, e.target.value))}
              className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
            >
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_BN[r]}</option>)}
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => removeTeamMemberAction(m.userId))}
              className="rounded-md px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-weak disabled:opacity-50"
            >
              সরান
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
