// @hybrid/ui — Bazaar Modern design system (theme "Doreja").
// shadcn-token-aligned primitives + storefront sections, driven by the
// CSS-variable token contract in ./globals.css (docs/DESIGN.md).

export const UI_PACKAGE = "@hybrid/ui" as const;

// Helpers
export { cn } from "./lib/cn";
export { toBnDigits, formatBdtBangla, formatBdtLatin } from "./lib/format";

// Primitives
export { Button } from "./components/Button";
export { Badge } from "./components/Badge";
export { StatusBadge } from "./components/StatusBadge";
export type { StatusKind } from "./components/StatusBadge";
export { StatusStepper } from "./components/StatusStepper";
export {
  CheckIcon,
  PhoneIcon,
  SearchIcon,
  CartIcon,
  ChatIcon,
  TruckIcon,
  ShieldIcon,
  ClockIcon,
  BoxIcon,
  CheckCircleIcon,
  XCircleIcon,
  UndoIcon,
  PlusIcon,
  TrashIcon,
  HomeIcon,
  BoxesIcon,
  UsersIcon,
  ReceiptIcon,
  MenuIcon,
  BkashIcon,
} from "./components/icons";

// Storefront sections
export { StoreHeader } from "./components/storefront/StoreHeader";
export { Hero } from "./components/storefront/Hero";
export { ProductCard } from "./components/storefront/ProductCard";
export { ProductGrid } from "./components/storefront/ProductGrid";
export { TrustBand } from "./components/storefront/TrustBand";
export { StoreFooter } from "./components/storefront/StoreFooter";
export { StickyActionBar } from "./components/storefront/StickyActionBar";
export type { StorefrontProduct, StoreIdentity } from "./components/storefront/types";
