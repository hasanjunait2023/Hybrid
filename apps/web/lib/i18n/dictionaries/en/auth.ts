// Auth-surface strings: login, signup, and the unknown-host "store not found"
// fallback. English source of truth; bn/auth.ts mirrors this shape exactly.
export const auth = {
  login: {
    metaTitle: "Log in — Hybrid",
    heading: "Log in to your account.",
    emailLabel: "Email",
    passwordLabel: "Password",
    submit: "Log in",
    submitting: "Logging in…",
    invalidCredentials: "Incorrect email or password.",
    genericError: "Sorry, something went wrong. Please try again.",
  },

  signup: {
    metaTitle: "Open your store — Hybrid",
    metaDescription: "Launch your online store in minutes. 14-day free trial.",
    railHeading: "Start today. Begin selling tomorrow.",
    railLead:
      "From a Facebook page to a real shop — a live storefront on your subdomain, cash on delivery, bKash and courier, all in Bangla.",
    railPointLiveStore: "A live store at your own address in minutes",
    railPointCourier: "One-click parcel booking with Steadfast courier",
    railPointPayments: "Cash on delivery and bKash — secure payments",
    formHeading: "Create your store",
    formSubtitle: "No card needed. 14-day free trial.",
    storeNameLabel: "Store name",
    storeNameHint: "e.g. Rahim's Fashion House",
    storeAddressLabel: "Your store address",
    storeAddressHint:
      "Everyone will see your store at this address. You can add a custom domain later.",
    suggestionsLabel: "These are available:",
    emailLabel: "Email address",
    submit: "Create my store",
    submitting: "Creating…",
    trialNote: "By starting you get a 14-day free trial — no card needed.",
  },

  storeNotFound: {
    heading: "Store not found",
    body: "There's no active store at this address. Check the link again, or open your own store.",
    cta: "Open a store on Hybrid",
  },
};
