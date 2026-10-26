import { ApiAccessError } from "@/lib/apiAuth";
import { captureHash, validSecret, pairingCode, normalizePairingCode, pairingLifetimeMs, deviceState, sameHash, deviceSelect, capturePackages } from "@/lib/captureProtocol";
import { processCaptureEvent } from "@/lib/captureProcessing";
import { captureParsers } from "@/lib/captureParsers";

export async function limitCaptureAttempts(db, scope, identity, maximum, now = new Date()) {
  const key = captureHash(`${scope}:${identity}`);
  const expiresAt = new Date(now.getTime() + pairingLifetimeMs);
  // Una sola sentencia serializa la ventana incluso entre instancias del servidor.
  const [row] = await db.$queryRaw`INSERT INTO capture_rate_limits (key, count, "expiresAt")
    VALUES (${key}, 1, ${expiresAt}) ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN capture_rate_limits."expiresAt" <= ${now} THEN 1 ELSE LEAST(capture_rate_limits.count + 1, ${maximum + 1}) END,
    "expiresAt" = CASE WHEN capture_rate_limits."expiresAt" <= ${now} THEN ${expiresAt} ELSE capture_rate_limits."expiresAt" END
    RETURNING count, "expiresAt"`;
  if (row.count > maximum) {
    const error = new ApiAccessError("Demasiados intentos. Espera unos minutos y vuelve a intentarlo.", 429);
    error.retryAfter = Math.max(1, Math.ceil((row.expiresAt - now) / 1000));
    throw error;
  }
}

export async function startCapturePairing(db, input, now = new Date()) {
  if (!input || !validSecret(input.secret) || typeof input.name !== "string" || !input.name.trim() || input.name.length > 80) {
    throw new ApiAccessError("El nombre o secreto del teléfono no son válidos.", 400);
  }
  const secretHash = captureHash(input.secret);
  const code = pairingCode(input.secret);
  // Solo se limpian límites vencidos; eventos e identidades autorizadas se conservan.
  await db.captureRateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
  const device = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${secretHash}, 0))`;
    return tx.captureDevice.upsert({
      where: { secretHash }, update: {},
      create: { secretHash, name: input.name.trim(), pairing: { create: {
        codeHash: captureHash(code), expiresAt: new Date(now.getTime() + pairingLifetimeMs),
      } } }, include: { pairing: true },
    });
  });
  if (device.userId || device.revokedAt) throw new ApiAccessError("Esta identidad ya se utilizó. Consulta su estado en el teléfono.", 409);
  if (device.pairing.expiresAt <= now) throw new ApiAccessError("El código venció. Genera una nueva vinculación.", 410);
  // Reintentar con el mismo secreto recupera el código, sin prolongar su vigencia.
  return { deviceId: device.id, code: code.match(/.{4}/g).join("-"), expiresAt: device.pairing.expiresAt };
}

export async function approveCapturePairing(db, userId, codeInput, now = new Date()) {
  const code = normalizePairingCode(codeInput);
  if (!/^[A-F0-9]{12}$/.test(code)) throw new ApiAccessError("Escribe el código de doce caracteres que aparece en tu teléfono.", 400);
  return db.$transaction(async tx => {
    const pairing = await tx.capturePairing.findUnique({ where: { codeHash: captureHash(code) } });
    if (!pairing) throw new ApiAccessError("El código no está disponible o venció.", 400);
    // Mismo bloqueo que recepción, pausa y revocación; la segunda aprobación nunca reasigna.
    await tx.$queryRaw`SELECT id FROM capture_devices WHERE id = ${pairing.deviceId}::uuid FOR UPDATE`;
    const fresh = await tx.capturePairing.findUnique({ where: { id: pairing.id } });
    const current = await tx.captureDevice.findUnique({ where: { id: pairing.deviceId } });
    const checkedAt = new Date(Math.max(now.getTime(), Date.now()));
    if (!current || current.revokedAt || current.userId || fresh.consumedAt || fresh.expiresAt <= checkedAt) throw new ApiAccessError("El código no está disponible o venció.", 400);
    const device = await tx.captureDevice.update({ where: { id: pairing.deviceId }, data: { userId, approvedAt: checkedAt }, select: deviceSelect });
    await tx.capturePairing.update({ where: { id: pairing.id }, data: { consumedAt: checkedAt } });
    return { device };
  });
}

export async function lockedCaptureDevice(tx, credential, activeOnly = false, now = new Date()) {
  await tx.$queryRaw`SELECT id FROM capture_devices WHERE id = ${credential.id}::uuid FOR UPDATE`;
  const device = await tx.captureDevice.findUnique({ where: { id: credential.id }, include: { pairing: true } });
  if (!device || !sameHash(device.secretHash, credential.secretHash)) throw new ApiAccessError("Credencial del teléfono no válida.", 401);
  if (activeOnly && deviceState(device, now) !== "ACTIVE") {
    throw new ApiAccessError(device.revokedAt ? "La autorización del teléfono fue revocada." : "El teléfono no está autorizado o está pausado.", device.revokedAt ? 401 : 403);
  }
  return device;
}

export async function getCaptureDevice(db, credential) {
  return db.$transaction(async tx => {
    const device = await lockedCaptureDevice(tx, credential);
    const state = deviceState(device);
    const verifiedFormats = captureParsers.filter(parser => parser.verified && !parser.moneyOnly && !parser.paymentOnly);
    const automaticExpenses = Boolean(device.userId && verifiedFormats.length && await tx.captureAutomation.findFirst({
      where: { userId: device.userId, mode: "AUTOMATIC", OR: verifiedFormats.map(parser => ({ parserKey: parser.key,
        ...(parser.completionPolicy ? { completionPolicy: parser.completionPolicy, policyAcceptedAt: { not: null }, policySubscriptionId: parser.policyRequiresSubscription ? { not: null } : null } : {}),
        ...(parser.dateSource === "NOTIFICATION_POSTED_AT" ? { datePolicy: "NOTIFICATION_POSTED_AT" } : {}) })) },
    }));
    if (device.userId && !device.revokedAt) await tx.captureDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    return { deviceId: device.id, ownerId: device.userId, state,
      configuration: { contractVersion: 1, mode: automaticExpenses ? "PER_CARD" : "OBSERVATION", automaticExpenses, allowedPackages: capturePackages, pausedPackages: device.pausedPackages || [] } };
  });
}

export async function changeCaptureDevice(db, userId, input) {
  if (!input || typeof input.deviceId !== "string" || !["pause", "resume", "revoke", "source"].includes(input.action)) throw new ApiAccessError("Acción no válida.", 400);
  if (input.action === "source" && (!capturePackages.includes(input.sourcePackage) || typeof input.paused !== "boolean")) throw new ApiAccessError("Fuente no válida.", 400);
  return db.$transaction(async tx => {
    // Un ID ajeno y uno inexistente producen la misma respuesta.
    const found = await tx.captureDevice.findFirst({ where: { id: input.deviceId, userId } });
    if (!found) throw new ApiAccessError("Dispositivo no encontrado.", 404);
    await tx.$queryRaw`SELECT id FROM capture_devices WHERE id = ${found.id}::uuid FOR UPDATE`;
    const device = await tx.captureDevice.findUnique({ where: { id: found.id } });
    if (device.revokedAt && input.action !== "revoke") throw new ApiAccessError("La autorización fue revocada. Vincula una nueva identidad desde el teléfono.", 409);
    const data = input.action === "source" ? { pausedPackages: capturePackages.filter(pkg => pkg === input.sourcePackage ? input.paused : (device.pausedPackages || []).includes(pkg)) }
      : input.action === "revoke" ? { revokedAt: device.revokedAt || new Date() }
      : { pausedAt: input.action === "pause" ? device.pausedAt || new Date() : null };
    return { device: await tx.captureDevice.update({ where: { id: device.id }, data, select: deviceSelect }) };
  });
}

export async function receiveCaptureEvent(db, credential, event) {
  return db.$transaction(async tx => {
    const device = await lockedCaptureDevice(tx, credential, true);
    const requestHash = captureHash(JSON.stringify(event));
    const existing = await tx.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } } });
    if (existing && existing.requestHash !== requestHash) throw new ApiAccessError("El UUID ya se recibió con otro contenido.", 409);
    const row = existing || await tx.captureEvent.create({ data: { ...event, postedAt: new Date(event.postedAt), receivedAt: new Date(event.receivedAt),
      deviceId: device.id, userId: device.userId, requestHash } });
    if (!existing) await processCaptureEvent(tx, row);
    await tx.captureDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    return { event: { id: row.id, eventId: row.eventId, status: "RECEIVED", receivedAt: row.createdAt } };
  });
}
