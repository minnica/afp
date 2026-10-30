import type { AccountResponse } from '@/lib/money/responses';
import { money } from './format';

export default function AccountYieldSummary({ account, inline = false }: { account: Pick<AccountResponse, 'yieldEstimate'>; inline?: boolean }) {
  const Root = inline ? 'span' : 'dl';
  const Group = inline ? 'span' : 'div';
  const Label = inline ? 'span' : 'dt';
  const Value = inline ? 'span' : 'dd';

  return (
    <Root data-slot="account-yield-summary" aria-label={inline ? undefined : 'Rendimiento estimado'} className="grid grid-cols-3 gap-3">
      {([
        ['Diario', account.yieldEstimate.daily],
        ['Semanal', account.yieldEstimate.weekly],
        ['Mensual', account.yieldEstimate.monthly],
      ] as const).map(([label, value]) => (
        <Group key={label} className="flex min-w-0 flex-col gap-1">
          <Label className="text-muted-foreground">{label}</Label>
          <Value className="font-medium tabular-nums [overflow-wrap:anywhere]">{money(value)}</Value>
        </Group>
      ))}
    </Root>
  );
}
