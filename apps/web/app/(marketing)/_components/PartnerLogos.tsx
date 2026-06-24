// Partner trust row — couriers + payment gateways. These are simple text
// wordmarks in brand-ish colors (NOT trademark logo files), set in a muted
// grayscale that warms to color on hover. Purely presentational, decorative.

interface Wordmark {
  label: string;
  /** Brand-ish color shown on hover; muted by default. */
  color: string;
}

const COURIERS: Wordmark[] = [
  { label: "Pathao", color: "#E60023" },
  { label: "RedX", color: "#E11D48" },
  { label: "Steadfast", color: "#0E7490" },
  { label: "Paperfly", color: "#16A34A" },
];

const PAYMENTS: Wordmark[] = [
  { label: "bKash", color: "#E2136E" },
  { label: "Nagad", color: "#EE7203" },
  { label: "SSLCommerz", color: "#1D4ED8" },
  { label: "COD", color: "#047857" },
];

function WordmarkPill({ mark }: { mark: Wordmark }) {
  return (
    <span
      className="group/wm inline-flex items-center text-lg font-bold tracking-tight text-ink-subtle transition-colors duration-base ease-out-soft hover:text-[var(--wm)] sm:text-xl"
      style={{ ["--wm" as string]: mark.color }}
    >
      {mark.label}
    </span>
  );
}

interface PartnerLogosProps {
  couriersLabel: string;
  paymentsLabel: string;
}

export function PartnerLogos({ couriersLabel, paymentsLabel }: PartnerLogosProps) {
  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      <PartnerGroup label={couriersLabel} marks={COURIERS} />
      <PartnerGroup label={paymentsLabel} marks={PAYMENTS} />
    </div>
  );
}

function PartnerGroup({ label, marks }: { label: string; marks: Wordmark[] }) {
  return (
    <div>
      <p className="bn-body text-xs font-semibold uppercase tracking-wider text-ink-subtle">
        {label}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-4">
        {marks.map((mark) => (
          <WordmarkPill key={mark.label} mark={mark} />
        ))}
      </div>
    </div>
  );
}
