-- CreateTable
CREATE TABLE "google_calendar_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleSubject" TEXT,
    "googleEmail" TEXT,
    "refreshToken" TEXT,
    "calendarId" TEXT,
    "calendarMarker" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "syncedRevision" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockToken" TEXT,
    "lockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_oauth_states" (
    "stateHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_oauth_states_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "google_calendar_events" (
    "connectionId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "eventDate" TEXT NOT NULL,
    "payloadHash" TEXT,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_events_pkey" PRIMARY KEY ("connectionId","sourceKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_connections_userId_key" ON "google_calendar_connections"("userId");

-- CreateIndex
CREATE INDEX "google_calendar_connections_status_nextAttemptAt_idx" ON "google_calendar_connections"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "calendar_oauth_states_expiresAt_idx" ON "calendar_oauth_states"("expiresAt");

-- CreateIndex
CREATE INDEX "calendar_oauth_states_userId_idx" ON "calendar_oauth_states"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_events_connectionId_eventId_key" ON "google_calendar_events"("connectionId", "eventId");

-- AddForeignKey
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_oauth_states" ADD CONSTRAINT "calendar_oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_events" ADD CONSTRAINT "google_calendar_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "google_calendar_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_oauth_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "google_calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "calendar_connection_status_check"
  CHECK ("status" IN ('DISCONNECTED', 'CONNECTED', 'RECONNECT_REQUIRED', 'DISCONNECTING'));

-- La revisión se invalida en la misma transacción que el dato financiero,
-- incluso en conciliaciones directas. El trigger no llama servicios externos.
CREATE FUNCTION public.afp_calendar_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text;
BEGIN
  owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
  UPDATE public.google_calendar_connections
    SET revision = revision + 1,
        "nextAttemptAt" = CASE WHEN "lastError" = 'RATE_LIMIT' THEN "nextAttemptAt" ELSE CURRENT_TIMESTAMP END
    WHERE "userId" = owner_id AND status = 'CONNECTED';
  IF TG_OP = 'UPDATE' AND OLD."userId" IS DISTINCT FROM NEW."userId" THEN
    UPDATE public.google_calendar_connections SET revision = revision + 1
      WHERE "userId" = OLD."userId" AND status = 'CONNECTED';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.afp_calendar_changed() FROM PUBLIC;

CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON cards FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();
CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON card_cycles FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();
CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON subscriptions FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();
CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON subscription_charges FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();
CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON daily_expenses FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();
CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON incomes FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();
CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON receivable_accounts FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();
CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON payable_accounts FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();
CREATE TRIGGER afp_calendar_changed AFTER INSERT OR UPDATE OR DELETE ON people FOR EACH ROW EXECUTE FUNCTION public.afp_calendar_changed();

