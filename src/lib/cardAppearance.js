// Identidad visual confirmada por el propietario; no modifica el producto ni
// las condiciones financieras guardadas en usagePolicy (BBVA conserva su dato).
const appearances = {
  bbva: { skin: "bbva-platinum", brand: "BBVA", product: "Platinum", logo: "/card-brands/bbva.svg", logoWidth: 600, logoHeight: 180 },
  hsbc: { skin: "hsbc-zero", brand: "HSBC", product: "Zero", logo: "/card-brands/hsbc.svg", logoWidth: 177, logoHeight: 38 },
  banamex: { skin: "banamex-joy", brand: "Banamex", product: "Joy" },
  santander: { skin: "santander-likeu", brand: "Santander", product: "LikeU · Roja" },
  nu: { skin: "nu", brand: "Nu", product: "Crédito", logo: "/card-brands/nu.svg", logoWidth: 44, logoHeight: 26 },
  didi: { skin: "didi", brand: "DiDi", product: "DiDi Card", logo: "/card-brands/didi.svg", logoWidth: 390, logoHeight: 100 },
  mercadopago: { skin: "mercado-pago", brand: "mercado pago", product: "Crédito" },
};

const confirmedNames = {
  BBVA: "bbva", "BBVA PLATINUM": "bbva",
  "HSBC 1": "hsbc", "HSBC 2": "hsbc", "HSBC ZERO": "hsbc",
  "BANAMEX 1": "banamex", "BANAMEX 2": "banamex", "BANAMEX JOY": "banamex", "JOY BANAMEX": "banamex",
  SANTANDER: "santander", "SANTANDER LIKEU": "santander", "LIKEU ROJA": "santander",
  NU: "nu", "NU CREDITO": "nu", DIDI: "didi", "DIDI CARD": "didi",
  MERCADOPAGO: "mercadopago", "MERCADO PAGO": "mercadopago",
};

export function getCardAppearance(card) {
  const name = String(card.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
  return appearances[confirmedNames[name]] || { skin: "neutral", brand: "Tarjeta", product: "Crédito" };
}
