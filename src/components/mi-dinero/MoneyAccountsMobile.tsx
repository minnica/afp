'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowReloadHorizontalIcon, PencilEdit01Icon } from '@hugeicons/core-free-icons';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { AccountResponse } from '@/lib/money/responses';
import { day } from '@/lib/money/dates';
import AccountYieldSummary from './AccountYieldSummary';
import { dateLabel, money } from './format';

interface MoneyAccountsMobileProps {
  accounts: AccountResponse[];
  onReconcile: (account: AccountResponse) => void;
  onEdit: (account: AccountResponse) => void;
}

const accountKinds = { BANK: 'Cuenta bancaria', SAVINGS: 'Ahorro a la vista', CASH: 'Efectivo' };

export default function MoneyAccountsMobile({ accounts, onReconcile, onEdit }: MoneyAccountsMobileProps) {
  return (
    <Accordion type="single" collapsible className="md:hidden">
      {accounts.map(account => (
        <AccordionItem key={account.id} value={account.id}>
          <AccordionTrigger className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 **:data-[slot=accordion-trigger-icon]:col-start-2 **:data-[slot=accordion-trigger-icon]:row-start-1">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold [overflow-wrap:anywhere]">{account.name}</span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-normal text-muted-foreground">Saldo actual</span>
                <span className="text-lg font-semibold tabular-nums [overflow-wrap:anywhere]">{money(account.balance)}</span>
              </span>
            </span>
            <span className="col-span-full min-w-0 text-sm">
              <AccountYieldSummary account={account} inline />
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-2 pb-2">
            <div className="flex min-w-0 flex-col gap-4">
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Referencia: {dateLabel(day(account.asOf))}</p>
                <Badge variant="outline">A la vista</Badge>
              </div>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{accountKinds[account.kind]}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Saldo de referencia</dt>
                  <dd className="min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">{money(account.openingBalance)}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11" onClick={() => onReconcile(account)} aria-label={`Conciliar saldo de ${account.name}`}>
                  <HugeiconsIcon icon={ArrowReloadHorizontalIcon} data-icon="inline-start" aria-hidden="true" />
                  Conciliar saldo
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={() => onEdit(account)} aria-label={`Editar ${account.name}`}>
                  <HugeiconsIcon icon={PencilEdit01Icon} data-icon="inline-start" aria-hidden="true" />
                  Editar
                </Button>
              </div>
              {account.reconciliations.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium">Últimas conciliaciones</h4>
                  <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                    {account.reconciliations.slice(0, 5).map(reconciliation => (
                      <li key={reconciliation.id} className="[overflow-wrap:anywhere]">
                        {dateLabel(day(reconciliation.date))}: {money(reconciliation.previousBalance)} → {money(reconciliation.bankBalance)}. {reconciliation.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
