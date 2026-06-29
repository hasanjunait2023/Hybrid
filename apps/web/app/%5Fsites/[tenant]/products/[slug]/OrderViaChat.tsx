// WhatsApp / Messenger order fallback (DESIGN §6.1 #8). BD F-commerce buyers
// live in chat; a one-tap "order on WhatsApp/Messenger" with the product name
// pre-filled is the highest-converting escape hatch when they don't want the
// full checkout. Server-rendered anchors — no JS needed. Brand-neutral tokens
// (no hardcoded hex) per the design gate.
interface OrderViaChatProps {
  phone: string | null | undefined;
  facebookUrl: string | null | undefined;
  productTitle: string;
  labels: { orderOnWhatsapp: string; orderOnMessenger: string; chatOrderPrefix: string };
}

// Normalize a BD phone to the wa.me international form (no +, no separators).
function waNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return `88${digits}`; // 01712… → 8801712…
  if (digits.length === 10 && digits.startsWith("1")) return `880${digits}`; // 1712…
  return digits;
}

// Only http(s) links are allowed (blocks javascript:/data: from seller input).
function httpUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function OrderViaChat({ phone, facebookUrl, productTitle, labels }: OrderViaChatProps) {
  const wa = phone ? waNumber(phone) : null;
  const fb = httpUrl(facebookUrl);
  if (!wa && !fb) return null;

  const text = `${labels.chatOrderPrefix} ${productTitle}`;
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-cod bg-cod-weak px-4 py-2.5 text-sm font-semibold text-cod hover:bg-cod hover:text-white"
        >
          <ChatIcon />
          {labels.orderOnWhatsapp}
        </a>
      )}
      {fb && (
        <a
          href={fb}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary bg-primary-weak px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
        >
          <ChatIcon />
          {labels.orderOnMessenger}
        </a>
      )}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
