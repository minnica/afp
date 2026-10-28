import type { Prisma, PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';

interface FaultHooks {
  before?(model: string, method: string, args: unknown): void;
  after?(model: string, method: string, args: unknown, result: unknown): void;
}
// El cliente y las transacciones son reales. Solo se intercepta la escritura
// elegida; PostgreSQL conserva consultas, locks, restricciones y rollback.
type TransactionOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
export type FaultClient = Omit<PrismaClient, '$transaction'> & {
  $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>, options?: TransactionOptions): Promise<T>;
};
export function faultingTransactions(db: PrismaClient, hooks: FaultHooks, forwardOptions = true): FaultClient {
  return new Proxy(db, { get(target, property): unknown {
    if (property !== '$transaction') { const value: unknown = Reflect.get(target, property); return value; }
    return (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => db.$transaction(tx => run(new Proxy(tx, {
      get(transaction, model): unknown {
        const delegate: unknown = Reflect.get(transaction, model);
        if (!delegate || typeof delegate !== 'object') return delegate;
        return new Proxy(delegate, { get(target, method): unknown {
          const fn: unknown = Reflect.get(target, method);
          if (!['create', 'createMany', 'update', 'delete', 'upsert'].includes(String(method))) return fn;
          assert.equal(typeof fn, 'function');
          if (typeof fn !== 'function') throw new Error('Operación Prisma inválida');
          return async (args: unknown) => {
            hooks.before?.(String(model), String(method), args);
            const result: unknown = await Reflect.apply(fn, target, [args]);
            hooks.after?.(String(model), String(method), args, result);
            return result;
          };
        } });
      },
    })), forwardOptions ? options : undefined);
  } });
}

export function debtAccounts(db: PrismaClient, kind: 'payable' | 'receivable') {
  type Create = Pick<Prisma.PayableAccountUncheckedCreateInput & Prisma.ReceivableAccountUncheckedCreateInput, 'userId' | 'personId' | 'concept' | 'originType' | 'originalAmount' | 'originDate'>;
  type Update = Pick<Prisma.PayableAccountUncheckedUpdateInput & Prisma.ReceivableAccountUncheckedUpdateInput, 'status' | 'originalAmount'>;
  return {
    create: (args: { data: Create }) => kind === 'payable' ? db.payableAccount.create(args) : db.receivableAccount.create(args),
    findUnique: (args: { where: { id: string } }) => kind === 'payable' ? db.payableAccount.findUnique(args) : db.receivableAccount.findUnique(args),
    update: (args: { where: { id: string }; data: Update }) => kind === 'payable' ? db.payableAccount.update(args) : db.receivableAccount.update(args),
  };
}
