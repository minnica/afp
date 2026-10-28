'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Field, FieldLabel, FieldDescription, FieldGroup, Input, Checkbox, Alert, AlertDescription, ResponsiveSelect, Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui';
import { z } from 'zod';
import { editorSubmissionSchema, type EditorConfiguration, type EditorInput, type EditorOutput, type EditorField, type EditorSubmission } from './editorContracts';
import { errorMessage } from '@/lib/money/client';

import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';




import { Button } from '@/components/ui/button';



import { ChevronDown, Loader2 } from 'lucide-react';

export default function MoneyEditor({ editor, onClose, onSave, restoreFocus }: { editor: EditorConfiguration; onClose: () => void; onSave: (payload: EditorSubmission) => Promise<void>; restoreFocus: (event: Event) => void }) {
  const schema: z.ZodType<EditorOutput, EditorInput> = editor.schema;
  const form = useForm<EditorInput, unknown, EditorOutput>({ resolver: zodResolver(schema), defaultValues: editor.values });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const frequency = useWatch({ control: form.control, name: 'frequencyMonths' });
  const yieldMethod = useWatch({ control: form.control, name: 'yieldMethod' });
  const historicalPayments = useWatch({ control: form.control, name: 'useHistoricalPayments' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [daysDraft, setDaysDraft] = useState(() => Object.fromEntries(editor.fields.filter(f => f.type === 'days').map(f => [f.name, ('days' in editor.values ? editor.values.days : []).join(', ')])));
  const titleRef = useRef<HTMLHeadingElement>(null), receipt = useRef<{ key: string; operationId: string } | null>(null);
  async function submit(values: EditorOutput) {
    setSaving(true); setError('');
    const payload = { ...editor.extra, ...values, action: editor.action };
    const key = JSON.stringify(payload);
    if (receipt.current?.key !== key) receipt.current = { key, operationId: crypto.randomUUID() };
    try { await onSave(editorSubmissionSchema.parse({ ...payload, operationId: receipt.current.operationId })); onClose(); }
    catch (failure) { setError(errorMessage(failure, 'No se pudo guardar. Conservamos los datos.')); }
    finally { setSaving(false); }
  }
  function renderField(config: EditorField) {
    if (config.kinds && !config.kinds.includes(kind || '')) return null;
    if (config.methods && !config.methods.includes(yieldMethod || '')) return null;
    if (config.singlePayment && kind === 'VARIABLE' && historicalPayments) return null;
    if (config.recurringDays && (!frequency || kind === 'VARIABLE')) return null;
    const id = `money-${config.name}`, fieldError = (form.formState.errors as Partial<Record<EditorField['name'], { message?: string } | { message?: string }[]>>)[config.name];
    const message = (fieldError && !Array.isArray(fieldError) ? fieldError.message : null) || (Array.isArray(fieldError) ? fieldError.find(e => e?.message)?.message : null);
    return <Field key={config.name} data-invalid={!!message}>
      {config.type !== 'checkbox' && <FieldLabel htmlFor={id}>{config.label}</FieldLabel>}
      <Controller name={config.name} control={form.control} render={({ field }) => config.options ?
        <ResponsiveSelect className="min-h-11" aria-invalid={!!message} aria-describedby={message ? `${id}-error` : config.help ? `${id}-help` : undefined} id={id} title={config.label} value={String(field.value || (config.nullable ? 'NONE' : field.value ?? ''))} onValueChange={(v: string) => {
          field.onChange(config.numeric ? Number(v) : config.nullable && v === 'NONE' ? '' : v);
          if (config.name === 'kind' && ['PAYROLL', 'INCOME', 'EXPENSE', 'VARIABLE'].includes(v)) {
            if (v !== 'PAYROLL') form.setValue('payrollBusinessDays', false);
            if (v === 'VARIABLE') form.setValue('frequencyMonths', 1);
            if (['PAYROLL', 'INCOME'].includes(v)) form.setValue('cardId', ''); else form.setValue('incomeTypeId', '');
            if (v !== 'VARIABLE') form.setValue('categoryId', '');
            if (v !== 'VARIABLE') form.setValue('useHistoricalPayments', false);
          }
          if (config.name === 'yieldMethod' && v === 'DAILY_AMOUNT') { form.setValue('yieldExcessRate', 0); form.setValue('yieldTaxPercent', 0); }
        }} options={config.options} disabled={saving || config.disabled || (config.name === 'frequencyMonths' && kind === 'VARIABLE')} placeholder="Selecciona una opción" /> : config.type === 'checkbox' ?
        <div className="flex min-h-11 items-start gap-3"><Checkbox id={id} checked={!!field.value} onCheckedChange={(v: boolean | 'indeterminate') => { field.onChange(v === true); if (config.name === 'useHistoricalPayments' && v === true) form.setValue('cardId', ''); }} disabled={saving} aria-invalid={!!message} aria-describedby={message ? `${id}-error` : config.help ? `${id}-help` : undefined} /><FieldLabel htmlFor={id}>{config.label}</FieldLabel></div> :
        <Input {...field} id={id} value={config.type === 'days' ? daysDraft[config.name] : typeof field.value === 'string' || typeof field.value === 'number' ? field.value : ''} type={config.type === 'days' ? 'text' : config.type || 'text'} inputMode={config.money ? 'decimal' : undefined} step={config.step ?? (config.money ? '0.01' : undefined)} disabled={saving || config.disabled} aria-invalid={!!message} aria-describedby={message ? `${id}-error` : config.help ? `${id}-help` : undefined} className="min-h-11" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { if (config.type === 'days') setDaysDraft(previous => ({ ...previous, [config.name]: e.target.value })); field.onChange(config.type === 'days' ? e.target.value.split(',').map(v => v.trim()).filter(Boolean).map(Number) : e.target.value); }} />
      } />
      {config.help && <FieldDescription id={`${id}-help`}>{config.help}</FieldDescription>}
      {message && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{message}</p>}
    </Field>;
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl" onOpenAutoFocus={(e: Event) => { e.preventDefault(); titleRef.current?.focus(); }} onCloseAutoFocus={restoreFocus} onEscapeKeyDown={(e: KeyboardEvent) => { if (saving) e.preventDefault(); }} onInteractOutside={(e: Event) => { if (saving) e.preventDefault(); }}>
      <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>{editor.title}</DialogTitle><DialogDescription>{editor.description}</DialogDescription></DialogHeader>
      <form onSubmit={event => { void form.handleSubmit(submit, errors => {
        if (editor.fields.some(f => f.advanced && f.name in errors)) setAdvancedOpen(true);
        setError('Revisa los campos indicados antes de guardar.');
      })(event); }} className="flex min-h-0 flex-col gap-5">
        <div className="min-h-0 overflow-y-auto px-1 pb-2">
          <FieldGroup>{editor.fields.filter(f => !f.advanced).map(renderField)}</FieldGroup>
          {editor.fields.some(f => f.advanced) && <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-5"><CollapsibleTrigger asChild><Button type="button" variant="outline" className="min-h-11 w-full">Rendimiento diario <ChevronDown data-icon="inline-end" /></Button></CollapsibleTrigger><CollapsibleContent className="pt-5"><FieldGroup>{editor.fields.filter(f => f.advanced).map(renderField)}</FieldGroup></CollapsibleContent></Collapsible>}
          {error && <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving} className="min-h-11">Cancelar</Button><Button type="submit" disabled={saving} className="min-h-11">{saving && <Loader2 className="animate-spin" data-icon="inline-start" />}{saving ? 'Guardando…' : editor.saveLabel || 'Guardar'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
