// CRM lifecycle automation admin strings (Phase R1.4). English source of truth;
// bn/admin/journeys.ts mirrors this shape exactly.
export const journeys = {
  title: "Automations",
  subtitle: "Auto-message customers at the right moment — set it once, it runs itself.",

  trigger: {
    review_request: "Review request (after delivery)",
    win_back: "Win back (lapsed customers)",
    repeat_buyer: "Repeat-buyer thank-you",
  },
  triggerShort: {
    review_request: "Review request",
    win_back: "Win back",
    repeat_buyer: "Repeat buyer",
  },

  nameLabel: "Name",
  namePlaceholder: "e.g. Ask for a review",
  triggerLabel: "Trigger",
  messageLabel: "Message",
  messagePlaceholder: "Hi {name}, thanks for your order!",
  messageHint: "Use {name} to insert the customer's name.",
  thresholdLabel: "Days after",
  thresholdHint: "Review request: days after delivery. Win back: days since last order.",
  minOrdersLabel: "Min orders",
  minOrdersHint: "Repeat-buyer: send once a customer reaches this many orders.",
  add: "Create automation",
  adding: "Creating…",
  addFailed: "Could not create the automation.",

  empty: "No automations yet.",
  channelSms: "SMS",
  active: "Active",
  paused: "Paused",
  pause: "Pause",
  activate: "Activate",
  delete: "Delete",
  runsUnit: "sent",
  runNow: "Run now",
  running: "Running…",
  ranResult: "Sent {sent}, failed {failed}.",
};
