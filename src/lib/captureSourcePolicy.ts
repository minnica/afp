// Viajes y pedidos: recepción de evidencia para validar sus formatos reales.
// No son emisores bancarios ni identifican por sí solos la tarjeta utilizada.
export const reviewOnlyCapturePackages = [
  "com.ubercab", "com.didiglobal.passenger", "com.ubercab.eats",
];

export const gmailCapturePackage = "com.google.android.gm";
export const bankCapturePackages = [
  "com.bancomer.mbanking", "mx.hsbc.hsbcmexico", "com.citibanamex.banamexmobile",
  "mx.bancosantander.supermovil", "com.nu.production", "com.didiglobal.cashloan", "com.mercadopago.wallet",
];
