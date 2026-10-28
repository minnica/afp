export interface AssetStatement { relation: string[]; target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] } }
export function normalizeFingerprint(value: unknown): string;
export function createStatements(fingerprint: string): AssetStatement[];
export function verifyStatements(statements: unknown, fingerprint: string): boolean;
