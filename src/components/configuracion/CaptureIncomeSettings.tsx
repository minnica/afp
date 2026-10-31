'use client';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { uiFetch } from '@/lib/uiClient';
import { errorMessage, type CaptureConfiguration } from '@/lib/uiTypes';
const estimate = z.string().refine(v => v === '' || /^\d+(?:\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Usa un importe positivo con hasta dos decimales.');
const schema = z.object({ sampleId: z.string().min(1, 'Selecciona un aviso.'), accountId: z.string().min(1, 'Selecciona la cuenta.'), incomeTypeId: z.string().min(1, 'Selecciona el tipo de ingreso.'), first: estimate, second: estimate, mode: z.enum(['OBSERVATION', 'AUTOMATIC']), accepted: z.boolean().refine(v => v, 'Confirma las condiciones de la regla.') });
export default function CaptureIncomeSettings({ configuration, userId, refresh }: { configuration: CaptureConfiguration; userId: string; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const policies = configuration.incomePolicies || [], samples = configuration.incomeSamples || [];
  const prior = policies[0];
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { sampleId: prior?.verifiedMovementId || '', accountId: prior?.accountId || '', incomeTypeId: prior?.incomeTypeId || '', first: prior?.estimatedFirstHalfAmount || '', second: prior?.estimatedSecondHalfAmount || '', mode: prior?.mode === 'AUTOMATIC' ? 'AUTOMATIC' : 'OBSERVATION', accepted: false } });
  const sample = samples.find(s => s.id === form.watch('sampleId')), payroll = sample?.parserKey === 'bbva.payroll.es.v1';
  return <section className="flex flex-col gap-4" aria-labelledby="income-rules-title"><h3 id="income-rules-title" className="text-base font-semibold">Ingresos BBVA y nómina</h3>
    <p className="text-sm text-muted-foreground">Una nómina sin importe puede sumar una cantidad estimada a Mi dinero en cuanto llegue su aviso. Confirma después el importe real en el mismo registro.</p>
    {policies.map(row => <p className="text-sm" key={row.id}>{configuration.moneyAccounts.find(a => a.id === row.accountId)?.name} · {row.parserKey === 'bbva.payroll.es.v1' ? 'Nómina' : 'Depósitos'} · {row.mode === 'AUTOMATIC' ? 'Automático' : 'Solo revisión'}</p>)}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}{notice && <p role="status" className="text-sm">{notice}</p>}
    {!samples.length ? <p className="text-sm">Falta un aviso propio. Los avisos de nómina anteriores pueden volver a leerse desde Otros avisos.</p> : <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(async v => {
      if (!sample) return;
      setBusy(true); setError(''); setNotice('');
      try {
        await uiFetch('/api/captures/configuration', { method: 'PATCH', expectedUserId: userId, errorMode: 'inline', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'incomePolicy', parserKey: sample.parserKey, accountSuffix: sample.proposal.accountSuffix, accountId: v.accountId, incomeTypeId: v.incomeTypeId, mode: v.mode, verifiedMovementId: sample.id, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', estimatedFirstHalfAmount: payroll && v.first ? v.first : null, estimatedSecondHalfAmount: payroll && v.second ? v.second : null }) });
        setNotice('Regla guardada. Se aplicará a nuevos avisos; los anteriores se resuelven desde su revisión.'); await refresh();
      } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
    })}><FieldGroup>
      {(['sampleId', 'accountId', 'incomeTypeId', 'mode'] as const).map(name => {
        const label = { sampleId: 'Aviso revisado de esta cuenta', accountId: 'Cuenta de destino', incomeTypeId: 'Tipo de ingreso', mode: 'Registro de nuevos avisos' }[name];
        const options = name === 'sampleId' ? samples.map(s => ({ value: s.id, label: `${s.parserKey === 'bbva.payroll.es.v1' ? 'Nómina' : 'Depósito'} · *${s.proposal.accountSuffix} · ${s.proposal.date}` })) : name === 'accountId' ? configuration.moneyAccounts.filter(a => a.kind === 'BANK').map(a => ({ value: a.id, label: a.name })) : name === 'incomeTypeId' ? (configuration.incomeTypes || []).map(a => ({ value: a.id, label: a.name })) : [{ value: 'OBSERVATION', label: 'Solo revisión' }, { value: 'AUTOMATIC', label: 'Automático' }];
        return <Field key={name} data-invalid={Boolean(form.formState.errors[name])}><FieldLabel htmlFor={`income-policy-${name}`}>{label}</FieldLabel><Controller name={name} control={form.control} render={({ field }) => <ResponsiveSelect id={`income-policy-${name}`} className="min-h-11" value={field.value} onValueChange={value => {
          field.onChange(value);
          if (name === 'sampleId') {
            const selected = samples.find(s => s.id === value);
            const saved = policies.find(policy => policy.parserKey === selected?.parserKey && policy.accountSuffix === selected?.proposal.accountSuffix);
            if (saved) {
              form.setValue('accountId', saved.accountId); form.setValue('incomeTypeId', saved.incomeTypeId);
              form.setValue('first', saved.estimatedFirstHalfAmount || ''); form.setValue('second', saved.estimatedSecondHalfAmount || '');
              form.setValue('mode', saved.mode === 'AUTOMATIC' ? 'AUTOMATIC' : 'OBSERVATION');
            }
            form.setValue('accepted', false);
          }
        }} disabled={busy} options={options} />} /><FieldError errors={[form.formState.errors[name]]} /></Field>;
      })}
      {payroll && (['first', 'second'] as const).map(name => <Field key={name} data-invalid={Boolean(form.formState.errors[name])}><FieldLabel htmlFor={`income-policy-${name}`}>{name === 'first' ? 'Nómina estimada del día 1 al 15' : 'Nómina estimada del día 16 al fin de mes'}</FieldLabel><Input id={`income-policy-${name}`} type="number" formatNumber min="0.01" step="0.01" className="min-h-11" disabled={busy} {...form.register(name)} /><FieldDescription>Importe neto en MXN. Puedes usar el recibo de nómina más reciente de esta quincena.</FieldDescription><FieldError errors={[form.formState.errors[name]]} /></Field>)}
      <Field orientation="horizontal"><Controller name="accepted" control={form.control} render={({ field }) => <Checkbox id="income-policy-accepted" checked={field.value} onCheckedChange={v => field.onChange(v === true)} disabled={busy} />} /><FieldLabel htmlFor="income-policy-accepted">{payroll ? 'Verifiqué la cuenta y el aviso. Acepto MXN, la fecha del aviso en México y sumar las nóminas sin importe con estas cantidades estimadas.' : 'Verifiqué la cuenta, el importe y el aviso de depósito. Acepto MXN y la fecha del aviso en México.'}</FieldLabel></Field><FieldError errors={[form.formState.errors.accepted]} />
    </FieldGroup><Button className="min-h-11 self-start" disabled={busy}>{busy ? 'Guardando…' : 'Guardar regla de ingresos'}</Button></form>}
  </section>;
}
