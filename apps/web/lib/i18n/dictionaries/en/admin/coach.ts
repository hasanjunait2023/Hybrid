// AI Growth Coach admin strings (Phase R2.3). English source of truth;
// bn/admin/coach.ts mirrors this shape exactly.
export const coach = {
  title: "Growth coach",
  subtitle: "Your store's health at a glance — and what to do next.",

  scoreLabel: "Health score",
  grade: { A: "Excellent", B: "Good", C: "Fair", D: "Needs work" },

  factorsHeading: "What's driving it",
  factor: {
    momentum: "Sales momentum",
    repeat: "Repeat customers",
    cod: "COD success",
    stock: "Stock health",
    backlog: "Order backlog",
    activity: "Weekly activity",
  },

  recsHeading: "Recommended actions",
  recsEmpty: "Everything looks healthy — keep it up!",
  rec: {
    backlog: "{n} orders are waiting to be confirmed — clear the backlog.",
    cod: "COD return rate is {n}% — verify high-risk orders before dispatch.",
    stock: "{n} products are low on stock — restock before you run out.",
    winback: "{n} customers have gone quiet — start a win-back automation.",
    momentum: "Sales dipped from last week — run a campaign or discount.",
    activity: "No orders this week — share your storefront and reach out.",
    loyalty: "Few customers come back — set up a loyalty / thank-you automation.",
  },
  cta: "Take action →",

  askHeading: "Ask the coach",
  askPlaceholder: "e.g. how do I sell more this month?",
  ask: "Ask",
  asking: "Thinking…",
  aiDisabled:
    "AI assistant is off — your health score and recommendations above are live. (Set AI_COACH_API_KEY to enable Bangla Q&A.)",
  aiError: "Couldn't get an answer — please try again.",
};
