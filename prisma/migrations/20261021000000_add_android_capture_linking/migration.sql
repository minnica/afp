-- CreateTable
CREATE TABLE "capture_devices" (
    "id" UUID NOT NULL,
    "secretHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "capture_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_pairings" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "capture_pairings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_events" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "sourcePackage" TEXT NOT NULL,
    "notificationKeyHash" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "fields" JSONB NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "capture_devices_secretHash_key" ON "capture_devices"("secretHash");

-- CreateIndex
CREATE INDEX "capture_devices_userId_createdAt_idx" ON "capture_devices"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "capture_devices_id_userId_key" ON "capture_devices"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "capture_pairings_deviceId_key" ON "capture_pairings"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "capture_pairings_codeHash_key" ON "capture_pairings"("codeHash");

-- CreateIndex
CREATE INDEX "capture_pairings_expiresAt_idx" ON "capture_pairings"("expiresAt");

-- CreateIndex
CREATE INDEX "capture_events_userId_createdAt_idx" ON "capture_events"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "capture_events_deviceId_eventId_key" ON "capture_events"("deviceId", "eventId");

-- CreateIndex
CREATE INDEX "capture_rate_limits_expiresAt_idx" ON "capture_rate_limits"("expiresAt");

-- AddForeignKey
ALTER TABLE "capture_devices" ADD CONSTRAINT "capture_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_pairings" ADD CONSTRAINT "capture_pairings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "capture_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_events" ADD CONSTRAINT "capture_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_events" ADD CONSTRAINT "capture_events_deviceId_userId_fkey" FOREIGN KEY ("deviceId", "userId") REFERENCES "capture_devices"("id", "userId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- Denegación pública explícita; las API validan cada ámbito de autorización.
ALTER TABLE capture_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_rate_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE capture_devices ADD CONSTRAINT capture_devices_approval_check
  CHECK (("userId" IS NULL) = ("approvedAt" IS NULL));

-- Un dispositivo autorizado jamás cambia de propietario, tampoco con eventos pendientes.
CREATE FUNCTION public.capture_device_owner_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."userId" IS NOT NULL AND NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'capture device owner is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_device_owner_immutable BEFORE UPDATE OF "userId" ON capture_devices
  FOR EACH ROW EXECUTE FUNCTION public.capture_device_owner_immutable();
