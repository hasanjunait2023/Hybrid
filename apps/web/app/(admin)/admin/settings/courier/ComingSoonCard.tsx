"use client";

// Honest "শীঘ্রই আসছে" provider card (DESIGN §Q4.2). RedX/Paperfly have no public
// API docs yet (brief §2.5), so their card shows a coming-soon banner with the
// toggle disabled — honest, not a dead control.
import { ProviderCard, TruckIcon } from "@hybrid/ui";

export function ComingSoonCard({ title }: { title: string }) {
  return (
    <ProviderCard
      icon={<TruckIcon className="h-6 w-6" />}
      title={title}
      configured={false}
      enabled={false}
      onEnabledChange={() => {}}
      comingSoon
    />
  );
}
