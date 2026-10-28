import type { PrismaClient } from '@prisma/client';
export const command: string;
export function configure(db: Pick<PrismaClient, '$queryRaw' | '$transaction'>, origin: string, secret: string): Promise<{ configured: boolean; interval: string; requests: string }>;
