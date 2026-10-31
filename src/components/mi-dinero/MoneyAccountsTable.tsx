'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowReloadHorizontalIcon, PencilEdit01Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AccountResponse } from '@/lib/money/responses';
import { day } from '@/lib/money/dates';
import { dateLabel, money } from './format';
import AccountYieldSummary from './AccountYieldSummary';
import type { AccountTotals } from './accountTotals';

interface MoneyAccountsTableProps {
  accounts: AccountResponse[];
  totals: AccountTotals;
  onReconcile: (account: AccountResponse) => void;
  onEdit: (account: AccountResponse) => void;
}

export default function MoneyAccountsTable({ accounts, totals, onReconcile, onEdit }: MoneyAccountsTableProps) {
  return (
    <div className="hidden min-w-0 rounded-lg border md:block">
      <Table tabIndex={0} className="min-w-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <TableCaption className="sr-only">
          Cuentas a la vista: saldo actual, rendimientos estimados diarios, semanales y mensuales y acciones por cuenta. Semana de 7 días y mes de 30 días, sin capitalización. El pie suma los saldos y rendimientos de todas las cuentas.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="pl-4">Cuenta</TableHead>
            <TableHead scope="col" className="text-right">Saldo actual</TableHead>
            <TableHead scope="col">Rendimiento estimado</TableHead>
            <TableHead scope="col" className="pr-4 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map(account => (
            <TableRow key={account.id}>
              <TableHead scope="row" className="w-1/4 py-4 pl-4 align-top whitespace-normal">
                <div className="flex flex-col items-start gap-2">
                  <span className="break-words text-sm font-medium [overflow-wrap:anywhere]">{account.name}</span>
                  <Badge variant="outline">A la vista</Badge>
                  <span className="font-normal text-muted-foreground">Referencia: {dateLabel(day(account.asOf))}</span>
                  {account.reconciliations.length > 0 && (
                    <Collapsible className="w-full">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="min-h-11" aria-label={`Últimas conciliaciones de ${account.name}`}>
                          Conciliaciones
                          <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" aria-hidden="true" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex flex-col gap-2 pt-2 font-normal text-muted-foreground">
                          <h3 className="font-medium text-foreground">Últimas conciliaciones</h3>
                          {account.reconciliations.slice(0, 5).map(reconciliation => (
                            <p key={reconciliation.id} className="break-words [overflow-wrap:anywhere]">
                              {dateLabel(day(reconciliation.date))}: {money(reconciliation.previousBalance)} → {money(reconciliation.bankBalance)}. {reconciliation.reason}
                            </p>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </TableHead>
              <TableCell className="py-4 text-right align-top tabular-nums">
                <span className="text-sm font-semibold">{money(account.balance)}</span>
                {!!account.estimatedIncomeAmount && <span className="text-xs text-warning">Incluye {money(account.estimatedIncomeAmount)} de nómina estimada</span>}
              </TableCell>
              <TableCell className="w-1/3 py-4 align-top whitespace-normal">
                <AccountYieldSummary account={account} />
              </TableCell>
              <TableCell className="py-4 pr-4 align-top">
                <div className="flex flex-col items-end gap-1">
                  <Button variant="outline" className="min-h-11" onClick={() => onReconcile(account)} aria-label={`Conciliar saldo de ${account.name}`}>
                    <HugeiconsIcon icon={ArrowReloadHorizontalIcon} data-icon="inline-start" aria-hidden="true" />
                    Conciliar saldo
                  </Button>
                  <Button variant="ghost" className="min-h-11" onClick={() => onEdit(account)} aria-label={`Editar ${account.name}`}>
                    <HugeiconsIcon icon={PencilEdit01Icon} data-icon="inline-start" aria-hidden="true" />
                    Editar
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableHead scope="row" className="py-4 pl-4 align-top">Total de cuentas</TableHead>
            <TableCell className="py-4 text-right align-top tabular-nums">
              <span className="text-sm font-semibold">{money(totals.balance)}</span>
            </TableCell>
            <TableCell className="py-4 align-top whitespace-normal">
              <AccountYieldSummary account={totals} />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
