-- CreateTable
CREATE TABLE "expense_operations" (
    "userId" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_operations_pkey" PRIMARY KEY ("userId","operationId")
);

-- AddForeignKey
ALTER TABLE "expense_operations" ADD CONSTRAINT "expense_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Solo la API autenticada accede mediante Prisma; sin políticas públicas.
ALTER TABLE "expense_operations" ENABLE ROW LEVEL SECURITY;
