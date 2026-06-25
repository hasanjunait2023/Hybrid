import * as React from "react";
import { Badge } from "@hybrid/ui";

export const Tones = () => (
  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: 28, background: "#fff" }}>
    <Badge tone="cod">ক্যাশ অন ডেলিভারি</Badge>
    <Badge tone="sale">সেল</Badge>
    <Badge tone="success">পরিশোধিত</Badge>
    <Badge tone="warning">অপেক্ষমাণ</Badge>
    <Badge tone="danger">বাতিল</Badge>
    <Badge tone="neutral">খসড়া</Badge>
  </div>
);
