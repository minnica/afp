// Identidad visual confirmada por el propietario; no modifica el producto ni
// las condiciones financieras guardadas en usagePolicy (BBVA conserva su dato).
export type CardAppearance = { skin: string; brand: string; product: string; productPlacement?: string; brandPlacement?: string; network?: string; logo?: string; logoWidth?: number; logoHeight?: number; productLogo?: string; productLogoWidth?: number; productLogoHeight?: number };
const appearances: Record<string, CardAppearance> = {
  bbva: { skin: "bbva-platinum", brand: "BBVA", product: "Platinum", productPlacement: "footer", network: "visa", logo: "/card-brands/bbva.svg", logoWidth: 600, logoHeight: 180 },
  hsbc: { skin: "hsbc-zero", brand: "HSBC", product: "Zero", network: "visa", logo: "/card-brands/hsbc.svg", logoWidth: 177, logoHeight: 38 },
  banamex: { skin: "banamex-joy", brand: "Banamex", product: "Joy", productPlacement: "below-brand", network: "mastercard", logo: "/card-brands/banamex-wordmark.webp", logoWidth: 284, logoHeight: 60 },
  santander: { skin: "santander-likeu", brand: "Santander", product: "LikeU", network: "mastercard", logo: "/card-brands/santander.svg", logoWidth: 345, logoHeight: 60, productLogo: "/card-brands/likeu-wordmark.svg", productLogoWidth: 420, productLogoHeight: 208 },
  nu: { skin: "nu", brand: "Nu", product: "crédito", network: "mastercard", logo: "/card-brands/nu.svg", logoWidth: 44, logoHeight: 26 },
  didi: { skin: "didi", brand: "DiDi", product: "DiDi Card", productPlacement: "none", network: "mastercard", logo: "/card-brands/didi-card-wordmark.webp", logoWidth: 140, logoHeight: 43 },
  mercadopago: { skin: "mercado-pago", brand: "mercado pago", brandPlacement: "footer", product: "crédito", productPlacement: "footer", network: "visa" },
};

const confirmedNames: Record<string, string> = {
  BBVA: "bbva", "BBVA PLATINUM": "bbva",
  "HSBC 1": "hsbc", "HSBC 2": "hsbc", "HSBC ZERO": "hsbc",
  "BANAMEX 1": "banamex", "BANAMEX 2": "banamex", "BANAMEX JOY": "banamex", "JOY BANAMEX": "banamex",
  SANTANDER: "santander", "SANTANDER LIKEU": "santander", "LIKEU ROJA": "santander",
  NU: "nu", "NU CREDITO": "nu", DIDI: "didi", "DIDI CARD": "didi",
  MERCADOPAGO: "mercadopago", "MERCADO PAGO": "mercadopago",
};

export function getCardAppearance(card: { name?: string }) {
  const name = String(card.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
  return appearances[confirmedNames[name] ?? ""] || { skin: "neutral", brand: "Tarjeta", product: "Crédito" };
}
