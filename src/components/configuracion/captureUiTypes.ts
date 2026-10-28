import type { CaptureResolution } from '@/lib/captureTypes';
import type { CaptureConfiguration,CaptureDetail } from '@/lib/uiTypes';
export type CaptureEditorProps = { detail: CaptureDetail; configuration: CaptureConfiguration; userId: string; onClose: () => void; onSaved: () => Promise<void>; restoreFocus: (event: Event) => void };
type WithoutId<T> = T extends { id: string } ? Omit<T, 'id'> : never;
export type CaptureAction = WithoutId<CaptureResolution>;
export type ConfigurationAction = Record<string, unknown> & { action: string; label?: string; subscriptionId?: string; mode?: string; kind?: string };
