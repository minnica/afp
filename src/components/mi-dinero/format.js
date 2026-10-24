export function money(value) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0)); }
export function dateLabel(value) { return value ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : 'Sin fecha'; }
export function monthLabel(value) { return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T12:00:00Z`)); }
export const accountOptions = accounts => accounts.map(a => ({ value: a.id, label: a.name }));
