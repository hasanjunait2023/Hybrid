import * as React from "react";
import { Button } from "@hybrid/ui";

export const Variants = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28, background: "#fff" }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <Button variant="primary">অর্ডার করুন</Button>
      <Button variant="secondary">সম্পাদনা</Button>
      <Button variant="accent">সেল</Button>
      <Button variant="ghost">বাতিল</Button>
      <Button variant="danger">মুছুন</Button>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button disabled>Disabled</Button>
    </div>
  </div>
);
