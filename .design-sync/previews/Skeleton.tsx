import * as React from "react";
import { Skeleton } from "@hybrid/ui";

export const Loading = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420, padding: 28, background: "#fff" }}>
    <Skeleton className="h-6 w-2/3" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-24 w-full" />
  </div>
);
