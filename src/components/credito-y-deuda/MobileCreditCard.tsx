"use client";
import type { Card as FinancialCard } from "@/lib/uiTypes";


import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getCardAppearance } from "@/lib/cardAppearance";
import Image from "next/image";

const currency = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const money = (amount: number | null | undefined) => amount == null ? "—" : currency.format(amount);

export default function MobileCreditCard({ card, balance, onEdit }: { card: FinancialCard; balance: ReturnType<typeof import("@/lib/cardBalances").getCardBalance>; onEdit: () => void }) {
  const appearance = getCardAppearance(card);
  const instance = ["banamex-joy", "hsbc-zero"].includes(appearance.skin) ? card.name.trim().match(/\s([12])$/)?.[1] : null;
  const product = instance ? `${appearance.product} · ${instance}` : appearance.product;
  const hasCreditBalance = (balance.creditBalance ?? 0) > 0;
  const brand = appearance.logo ? (
    <Image src={appearance.logo} width={appearance.logoWidth} height={appearance.logoHeight} alt="" className="credit-card-brand-logo" unoptimized />
  ) : <span className="credit-card-wordmark" aria-hidden="true">{appearance.skin === "neutral" ? card.name : appearance.brand}</span>;
  const productMark = <span className="credit-card-product">{appearance.productLogo ? <Image src={appearance.productLogo} width={appearance.productLogoWidth} height={appearance.productLogoHeight} alt={product} className="credit-card-product-logo" unoptimized /> : product}</span>;
  return (
    <Card className="mobile-credit-card gap-0 p-0 ring-0 md:hidden" data-card-skin={appearance.skin}>
      <div className="credit-card-face">
        <div className="credit-card-art" aria-hidden="true" />
        <CardHeader className="credit-card-face-header">
          <div className="credit-card-brand-row">
            {appearance.brandPlacement !== "footer" ? <div className="credit-card-brand-block">{brand}{appearance.productPlacement === "below-brand" ? productMark : null}</div> : null}
            {!appearance.productPlacement ? productMark : null}
          </div>
          <CardTitle className="sr-only"><h3>{card.name}</h3></CardTitle>
        </CardHeader>
        <CardContent className="credit-card-face-content">
          <dl className="credit-card-amounts">
            <div className="credit-card-used">
              <dt>{!balance.hasBalance ? "Sin saldo capturado" : hasCreditBalance ? "Saldo a favor" : "Saldo utilizado"}{(balance.overLimit ?? 0) > 0 ? <span> · Exceso {money(balance.overLimit)}</span> : null}</dt>
              <dd>{money(hasCreditBalance ? balance.creditBalance : balance.usedBalance)}</dd>
            </div>
            <div><dt>Línea de crédito</dt><dd>{money(balance.creditLimit)}</dd></div>
            <div><dt>Disponible</dt><dd>{money(balance.availableCredit)}</dd></div>
          </dl>
        </CardContent>
        {appearance.network ? (
          <CardFooter className="credit-card-face-footer">
            {appearance.brandPlacement === "footer" ? brand : null}
            <div className="credit-card-network" data-network={appearance.network}>
              <Image src={`/card-brands/${appearance.network}.svg`} width={appearance.network === "visa" ? 1000 : 100} height={appearance.network === "visa" ? 325 : 62} alt={appearance.network === "visa" ? "Visa" : "Mastercard"} className="credit-card-network-logo" unoptimized />
              {appearance.productPlacement === "footer" ? productMark : null}
            </div>
          </CardFooter>
        ) : null}
        <Button type="button" variant="ghost" className="credit-card-open" aria-haspopup="dialog" aria-label={`${balance.hasBalance ? "Actualizar" : "Capturar"} saldo de ${card.name}`} onClick={onEdit} />
      </div>
    </Card>
  );
}
