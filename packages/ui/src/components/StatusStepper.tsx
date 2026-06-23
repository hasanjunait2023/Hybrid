// StatusStepper — the order lifecycle spine (DESIGN §P3.2). Presentational,
// fed by order_fulfillment_status. One component, three placements (order
// detail header, buyer success page, dashboard hover).
//
// Pipeline: pending → confirmed → packed → shipped → delivered, with
// returned / cancelled as a terminal off-ramp shown only when active.
// Color + icon + label for every state (§7.4). Horizontal on ≥sm, vertical on
// mobile (never shrink labels below 12.5px).
import { cn } from "../lib/cn";
import {
  ClockIcon,
  CheckIcon,
  BoxIcon,
  TruckIcon,
  CheckCircleIcon,
  UndoIcon,
  XCircleIcon,
} from "./icons";

type Step = {
  key: string;
  bn: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  /** weak bg / DEFAULT text Tailwind classes (full strings for JIT). */
  dot: string;
  text: string;
};

const PIPELINE: Step[] = [
  { key: "pending", bn: "অপেক্ষমাণ", Icon: ClockIcon, dot: "bg-st-pending text-white", text: "text-st-pending" },
  { key: "confirmed", bn: "নিশ্চিত", Icon: CheckIcon, dot: "bg-st-confirmed text-white", text: "text-st-confirmed" },
  { key: "packed", bn: "প্যাকড", Icon: BoxIcon, dot: "bg-st-packed text-white", text: "text-st-packed" },
  { key: "shipped", bn: "পাঠানো", Icon: TruckIcon, dot: "bg-st-shipped text-white", text: "text-st-shipped" },
  { key: "delivered", bn: "ডেলিভার্ড", Icon: CheckCircleIcon, dot: "bg-st-delivered text-white", text: "text-st-delivered" },
];

// shipped and in_transit collapse to the same stepper node.
const NORMALIZE: Record<string, string> = { in_transit: "shipped" };

const OFFRAMP: Record<string, Step> = {
  returned: { key: "returned", bn: "ফেরত", Icon: UndoIcon, dot: "bg-st-returned text-white", text: "text-st-returned" },
  cancelled: { key: "cancelled", bn: "বাতিল", Icon: XCircleIcon, dot: "bg-st-cancelled text-white", text: "text-st-cancelled" },
};

interface StatusStepperProps {
  status: string;
  className?: string;
}

export function StatusStepper({ status, className }: StatusStepperProps) {
  const normalized = NORMALIZE[status] ?? status;
  const offramp = OFFRAMP[normalized];

  // Off-ramp (returned/cancelled): show the linear pipeline up to its last
  // reached point, then the off-ramp node replacing "delivered".
  const steps = offramp
    ? [...PIPELINE.slice(0, 4), offramp]
    : PIPELINE;

  // Index of the current/last-reached step.
  const currentIndex = offramp
    ? steps.length - 1
    : PIPELINE.findIndex((s) => s.key === normalized);

  return (
    <ol
      className={cn(
        "flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0",
        className,
      )}
      aria-label="অর্ডার স্ট্যাটাস"
    >
      {steps.map((step, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const Icon = step.Icon;
        return (
          <li
            key={step.key}
            className="relative flex flex-1 items-center gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
          >
            {/* connector (between nodes) */}
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  // vertical on mobile, horizontal on sm+
                  "absolute left-[15px] top-0 h-1/2 w-0.5 -translate-y-full sm:left-auto sm:right-1/2 sm:top-4 sm:h-0.5 sm:w-full sm:translate-y-0",
                  reached ? "bg-current" : "bg-border",
                  reached && step.text,
                )}
              />
            )}
            <span
              className={cn(
                "z-base flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                reached
                  ? cn(step.dot, "border-transparent")
                  : "border-border bg-surface text-ink-subtle",
                isCurrent && "shadow-focus",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span
              className={cn(
                "py-2 text-xs font-semibold sm:py-0",
                reached ? step.text : "text-ink-subtle",
              )}
            >
              {step.bn}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
