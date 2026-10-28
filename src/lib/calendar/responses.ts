import { z } from 'zod';

export const googleLabelPropertiesSchema = z.object({
  eventLabels: z.array(z.object({ id: z.string(), name: z.string().optional(), backgroundColor: z.string().optional() }).catchall(z.json().optional())).optional(),
}).catchall(z.json().optional());
// One transport handles OAuth, profile, calendars and events. Known fields are
// checked before use; provider metadata and absent fields remain compatible.
export const googleResourceSchema = z.object({
  id: z.string().optional(), status: z.string().optional(), etag: z.string().optional(),
  summary: z.string().optional(), description: z.string().optional(),
  access_token: z.string().optional(), refresh_token: z.string().optional(), scope: z.string().optional(),
  sub: z.string().optional(), email: z.string().optional(), email_verified: z.boolean().optional(),
  nextPageToken: z.string().optional(), items: z.array(z.unknown()).optional(),
  start: z.object({ date: z.string().optional() }).catchall(z.json().optional()).optional(),
  end: z.object({ date: z.string().optional() }).catchall(z.json().optional()).optional(),
  transparency: z.string().optional(), visibility: z.string().optional(), eventLabelId: z.string().optional(),
  reminders: z.object({ useDefault: z.boolean().optional(), overrides: z.array(z.json()).optional() }).catchall(z.json().optional()).optional(),
  extendedProperties: z.object({ private: z.record(z.string(), z.string()).optional() }).catchall(z.json().optional()).optional(),
  labelProperties: googleLabelPropertiesSchema.optional(),
  error: z.union([z.string(), z.object({ errors: z.array(z.object({ reason: z.string().optional() }).catchall(z.json().optional())).optional() }).catchall(z.json().optional())]).optional(),
}).catchall(z.unknown());

export function googleResource(value: unknown) { return googleResourceSchema.parse(value); }
