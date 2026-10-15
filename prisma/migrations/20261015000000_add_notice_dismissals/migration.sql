-- CreateTable
CREATE TABLE "notice_dismissals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "noticeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notice_dismissals_userId_month_idx" ON "notice_dismissals"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "notice_dismissals_userId_month_noticeKey_key" ON "notice_dismissals"("userId", "month", "noticeKey");

-- AddForeignKey
ALTER TABLE "notice_dismissals" ADD CONSTRAINT "notice_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preferencias privadas: solo la API autenticada accede mediante Prisma.
-- Prisma no representa RLS en el esquema; sin políticas públicas no se expone
-- esta tabla a clientes de PostgREST con las claves anon/authenticated.
ALTER TABLE "notice_dismissals" ENABLE ROW LEVEL SECURITY;
