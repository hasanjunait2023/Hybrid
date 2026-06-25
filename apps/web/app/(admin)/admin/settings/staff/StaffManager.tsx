"use client";

// Staff roster + management (P2-2). Add by email, change role, remove. Owner-only
// controls (grant/revoke owner) are gated client-side AND server-side. Read-only
// for staff. Latin numerals.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { addMemberAction, changeRoleAction, removeMemberAction } from "./actions";

type MemberRole = "owner" | "admin" | "staff";

interface Member {
  userId: string;
  email: string;
  fullName: string | null;
  role: MemberRole;
}

const ROLE_CLS: Record<MemberRole, string> = {
  owner: "bg-primary-weak text-primary",
  admin: "bg-st-confirmed-weak text-st-confirmed",
  staff: "bg-surface-2 text-ink-muted",
};

export function StaffManager({
  members,
  canManage,
  isOwner,
  selfUserId,
}: {
  members: Member[];
  canManage: boolean;
  isOwner: boolean;
  selfUserId: string;
}) {
  const router = useRouter();
  const d = useDict();
  const t = d.admin.settingsComms;
  const roleLabels = t.staff.roles;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const roleOptions: MemberRole[] = isOwner ? ["owner", "admin", "staff"] : ["admin", "staff"];

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? t.staff.failed);
      else router.refresh();
    });
  };

  const add = (formData: FormData) => {
    const email = String(formData.get("email") ?? "");
    const role = String(formData.get("role") ?? "staff");
    const fullName = String(formData.get("fullName") ?? "");
    act(() => addMemberAction(email, role, fullName || undefined));
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <form action={add} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{t.staff.emailLabel}</span>
            <input name="email" type="email" required placeholder="staff@example.com"
              className="h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{t.staff.nameLabel}</span>
            <input name="fullName" placeholder={d.common.label.optional}
              className="h-11 w-36 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{t.staff.roleLabel}</span>
            <select name="role" defaultValue="staff"
              className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none">
              {roleOptions.map((r) => (<option key={r} value={r}>{roleLabels[r]}</option>))}
            </select>
          </label>
          <Button type="submit" disabled={pending}>{pending ? "…" : t.staff.addMember}</Button>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">{error}</p>
      )}

      <ul className="overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{m.fullName ?? m.email}</p>
              <p className="truncate text-xs text-ink-muted">{m.email}{m.userId === selfUserId ? t.staff.youSuffix : ""}</p>
            </div>
            {canManage ? (
              <select
                value={m.role}
                disabled={pending}
                onChange={(e) => act(() => changeRoleAction(m.userId, e.target.value))}
                className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
              >
                {(["owner", "admin", "staff"] as MemberRole[]).map((r) => (
                  <option key={r} value={r} disabled={r === "owner" && !isOwner}>{roleLabels[r]}</option>
                ))}
              </select>
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${ROLE_CLS[m.role]}`}>{roleLabels[m.role]}</span>
            )}
            {canManage && m.userId !== selfUserId && (
              <button
                type="button"
                disabled={pending}
                onClick={() => act(() => removeMemberAction(m.userId))}
                className="rounded-md px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-weak disabled:opacity-50"
              >
                {d.common.action.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
