export const SOURCE_LABEL: Record<string, string> = {
  WEB_FORM: "Web form",
  WHATSAPP: "WhatsApp",
  MANUAL: "Manual entry",
  CHATBOT: "AI chat",
};

export const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  BUSY: "Busy",
  ON_LEAVE: "On leave",
  OFFLINE: "Offline",
};

export const LEVEL_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", USER: "User" };

export const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  EXPIRED: "Expired",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partly refunded",
};

export const PROVIDER_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp Cloud API",
  STRIPE: "Stripe",
  GOOGLE: "Google Calendar",
  RESEND: "Resend email",
};

export const FIELD_TYPE_LABEL: Record<string, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  DROPDOWN: "Dropdown",
  CHECKBOX: "Checkbox",
};
