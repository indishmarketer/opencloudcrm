export const SYSTEM_WORKFLOW_CATALOG = [
  {
    id: "account-phone-otp",
    name: "Account phone verification",
    trigger: "Someone requests phone verification",
    actions: ["Send authentication WhatsApp template", "Verify entered code"],
    detail: "Validates the new number before saving it to the account.",
    source: "src/app/api/account/phone/start/route.ts",
  },
] as const;
