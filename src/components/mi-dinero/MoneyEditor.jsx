'use client';

import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldLabel, FieldDescription, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ResponsiveSelect } from '@/components/ui/responsive-select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2 } from 'lucide-react';

export default function MoneyEditor({ editor, onClose, onSave, restoreFocus }) {
  const form = useForm({ resolver: zodResolver(editor.schema), defaultValues: editor.values });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const frequency = useWatch({ control: form.control, name: 'frequencyMonths' });
  const yieldMethod = useWatch({ control: form.control, name: 'yieldMethod' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [daysDraft, setDaysDraft] = useState(() => Object.fromEntries(editor.fields.filter(f => f.type === 'days').map(f => [f.name, (editor.values[f.name] || []).join(', ')])));
  const titleRef = useRef(null), receipt = useRef(null);
  async function submit(values) {
    setSaving(true); setError('');
    const payload = { ...editor.extra, ...values, action: editor.action };
    const key = JSON.stringify(payload);
    if (receipt.current?.key !== key) receipt.current = { key, operationId: crypto.randomUUID() };
    try { await onSave({ ...payload, operationId: receipt.current.operationId }); onClose(); }
    catch (failure) { setError(failure.message || 'No se pudo guardar. Conservamos los datos.'); }
    finally { setSaving(false); }
  }
  function renderField(config) {
    if (config.kinds && !config.kinds.includes(kind)) return null;
    if (config.methods && !config.methods.includes(yieldMethod)) return null;
    if (config.recurringDays && (!frequency || kind === 'VARIABLE')) return null;
    const id = `money-${config.name}`, fieldError = form.formState.errors[config.name];
    const message = fieldError?.message || (Array.isArray(fieldError) ? fieldError.find(e => e?.message)?.message : null);
    return <Field key={config.name} data-invalid={!!message}>
      {config.type !== 'checkbox' && <FieldLabel htmlFor={id}>{config.label}</FieldLabel>}
      <Controller name={config.name} control={form.control} render={({ field }) => config.options ?
        <ResponsiveSelect className="min-h-11" aria-invalid={!!message} aria-describedby={message ? `${id}-error` : config.help ? `${id}-help` : undefined} id={id} title={config.label} value={String(field.value || (config.nullable ? 'NONE' : field.value ?? ''))} onValueChange={v => {
          field.onChange(config.numeric ? Number(v) : config.nullable && v === 'NONE' ? '' : v);
          if (config.name === 'kind' && ['PAYROLL', 'INCOME', 'EXPENSE', 'VARIABLE'].includes(v)) {
            if (v !== 'PAYROLL') form.setValue('payrollBusinessDays', false);
            if (v === 'VARIABLE') form.setValue('frequencyMonths', 1);
            if (['PAYROLL', 'INCOME'].includes(v)) form.setValue('cardId', ''); else form.setValue('incomeTypeId', '');
            if (v !== 'VARIABLE') form.setValue('categoryId', '');
          }
          if (config.name === 'yieldMethod' && v === 'DAILY_AMOUNT') { form.setValue('yieldExcessRate', 0); form.setValue('yieldTaxPercent', 0); }
        }} options={config.options} disabled={saving || config.disabled || (config.name === 'frequencyMonths' && kind === 'VARIABLE')} placeholder="Selecciona una opción" /> : config.type === 'checkbox' ?
        <div className="flex min-h-11 items-start gap-3"><Checkbox id={id} checked={!!field.value} onCheckedChange={v => field.onChange(v === true)} disabled={saving} aria-invalid={!!message} aria-describedby={message ? `${id}-error` : config.help ? `${id}-help` : undefined} /><FieldLabel htmlFor={id}>{config.label}</FieldLabel></div> :
        <Input {...field} id={id} value={config.type === 'days' ? daysDraft[config.name] : field.value ?? ''} type={config.type === 'days' ? 'text' : config.type || 'text'} inputMode={config.money ? 'decimal' : undefined} step={config.step ?? (config.money ? '0.01' : undefined)} disabled={saving || config.disabled} aria-invalid={!!message} aria-describedby={message ? `${id}-error` : config.help ? `${id}-help` : undefined} className="min-h-11" onChange={e => { if (config.type === 'days') setDaysDraft(previous => ({ ...previous, [config.name]: e.target.value })); field.onChange(config.type === 'days' ? e.target.value.split(',').map(v => v.trim()).filter(Boolean).map(Number) : e.target.value); }} />
      } />
      {config.help && <FieldDescription id={`${id}-help`}>{config.help}</FieldDescription>}
      {message && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{message}</p>}
    </Field>;
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl" onOpenAutoFocus={e => { e.preventDefault(); titleRef.current?.focus(); }} onCloseAutoFocus={restoreFocus} onEscapeKeyDown={e => { if (saving) e.preventDefault(); }} onInteractOutside={e => { if (saving) e.preventDefault(); }}>
      <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>{editor.title}</DialogTitle><DialogDescription>{editor.description}</DialogDescription></DialogHeader>
      <form onSubmit={event => { void form.handleSubmit(submit, errors => {
        if (editor.fields.some(f => f.advanced && errors[f.name])) setAdvancedOpen(true);
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
