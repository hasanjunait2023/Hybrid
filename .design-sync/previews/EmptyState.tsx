import * as React from "react";
import { EmptyState, Button } from "@hybrid/ui";

export const NoOrders = () => (
  <div style={{ maxWidth: 460, padding: 28, background: "#fbfaf8" }}>
    <EmptyState
      title="এখনো কোনো অর্ডার নেই"
      hint="নতুন অর্ডার এলে এখানে দেখা যাবে। ততক্ষণে আপনার পণ্য যোগ করুন।"
      action={<Button size="sm">পণ্য যোগ করুন</Button>}
    />
  </div>
);
