const gbp = (digits: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const money = (value: number, digits = 0) => gbp(digits).format(value);
export const compactMoney = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", notation: "compact", maximumFractionDigits: 1 }).format(value);
export const count = (value: number) => new Intl.NumberFormat("en-GB").format(Math.round(value));
export const compact = (value: number) =>
  new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
export const percent = (value: number) => `${Math.round(value * 100)}%`;
export const index = (value: number) => String(Math.round(value * 100));

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
