import * as React from "react";
import { CredentialField } from "@hybrid/ui";

export const Saved = () => {
  const [v, setV] = React.useState("");
  return (
    <div style={{ maxWidth: 420, padding: 28, background: "#fff" }}>
      <CredentialField id="bkash-key" label="bKash App Key" value={v} onChange={setV} hint="••••3d9l" />
    </div>
  );
};
