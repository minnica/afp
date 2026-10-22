"use client";

import Image from "next/image";
import { getCardAppearance } from "@/lib/cardAppearance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const currency = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const money = amount => amount == null ? "—" : currency.format(amount);

export default function MobileCreditCard({ card, balance, onEdit }) {
  const appearance = getCardAppearance(card);
  const instance = ["banamex-joy", "hsbc-zero"].includes(appearance.skin) ? card.name.trim().match(/\s([12])$/)?.[1] : null;
  const product = instance ? `${appearance.product} · ${instance}` : appearance.product;
  const hasCreditBalance = balance.creditBalance > 0;
  return (
    <Card className="mobile-credit-card gap-0 p-0 ring-0 md:hidden" data-card-skin={appearance.skin}>
      <div className="credit-card-face">
        <div className="credit-card-art" aria-hidden="true"><span /><span /><span /></div>
        <CardHeader className="credit-card-face-header">
          <div className="credit-card-brand-row">
            {appearance.logo ? (
              <Image src={appearance.logo} width={appearance.logoWidth} height={appearance.logoHeight} alt="" className="credit-card-brand-logo" unoptimized />
            ) : <span className="credit-card-wordmark" aria-hidden="true">{appearance.skin === "neutral" ? card.name : appearance.brand}</span>}
            <span className="credit-card-product">{product}</span>
          </div>
          <CardTitle className="sr-only"><h3>{card.name}</h3></CardTitle>
        </CardHeader>
        <CardContent className="credit-card-face-content">
          <dl className="credit-card-amounts">
            <div className="credit-card-used">
              <dt>{!balance.hasBalance ? "Sin saldo capturado" : hasCreditBalance ? "Saldo a favor" : "Saldo utilizado"}{balance.overLimit > 0 ? <span> · Exceso {money(balance.overLimit)}</span> : null}</dt>
              <dd>{money(hasCreditBalance ? balance.creditBalance : balance.usedBalance)}</dd>
            </div>
            <div><dt>Línea de crédito</dt><dd>{money(balance.creditLimit)}</dd></div>
            <div><dt>Disponible</dt><dd>{money(balance.availableCredit)}</dd></div>
          </dl>
        </CardContent>
        {balance.hasBalance && balance.utilization !== null ? (
          <CardFooter className="credit-card-face-footer">
            <div className="credit-card-usage">
              <Progress value={Math.min(balance.utilization, 100)} aria-label={`Crédito utilizado de ${card.name}`} getValueLabel={() => `${balance.utilization.toFixed(1)} % del límite utilizado`} className="credit-card-progress [&_[data-slot=progress-indicator]]:motion-reduce:transition-none" />
              <span className="credit-card-percentage">{balance.utilization.toFixed(1)} %</span>
            </div>
          </CardFooter>
        ) : null}
        <Button type="button" variant="ghost" className="credit-card-open" aria-haspopup="dialog" aria-label={`${balance.hasBalance ? "Actualizar" : "Capturar"} saldo de ${card.name}`} onClick={onEdit} />
      </div>
    </Card>
  );
}
