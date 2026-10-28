export interface MigrationFile { migration_name: string; checksum: string }
export interface MigrationRow extends MigrationFile { finished: boolean; rolled_back: boolean }
export function localMigrations(): MigrationFile[];
export function auditHistory(rows: MigrationRow[], local?: MigrationFile[]): { errors: string[]; pending: string[] };
export const root: string;
