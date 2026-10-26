import { prisma } from "@/lib/prisma";
import { requireApiUser, apiResponse, apiAccessErrorResponse, ApiAccessError } from "@/lib/apiAuth";
import { resolveCaptureMovement } from "@/lib/captureProcessing";
import { readCaptureJson } from "@/lib/captureProtocol";
import { captureInboxWhere, captureInboxState, effectiveCapture } from "@/lib/captureReview";
import { captureCandidates } from "@/lib/captureProcessing";
import { paymentCaptureKind } from "@/lib/capturePaymentParsers";
import { capturePaymentDetail } from "@/lib/capturePayments";
import { refundCaptureKind } from "@/lib/captureRefundParsers";
import { refundDetail } from "@/lib/captureRefunds";
import { captureKinds, captureKindWhere, captureMovementKind } from "@/lib/captureInbox";

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const status = searchParams.get("status");
    const kind = searchParams.get("kind");
    const cardId = searchParams.get("cardId");
    if (kind && !captureKinds.includes(kind)) throw new ApiAccessError("Tipo de movimiento no válido.", 400);
    if (cardId && !await prisma.card.findFirst({ where: { id: cardId, userId: user.id }, select: { id: true } })) throw new ApiAccessError("Tarjeta no encontrada.", 404);
    if (searchParams.get("id") && !/^[0-9a-f-]{36}$/i.test(searchParams.get("id"))) throw new ApiAccessError("Aviso no válido.", 400);
    if (status && !["REVIEW", "OBSERVED", "REGISTERED", "LINKED", "DISCARDED", "CONVERTED", "RECONCILED"].includes(status)) throw new ApiAccessError("Estado no válido.", 400);
    if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) throw new ApiAccessError("Página no válida.", 400);
    if (cursor && !await prisma.captureMovement.findFirst({ where: { id: cursor, userId: user.id } })) throw new ApiAccessError("Página no encontrada.", 404);
    if (searchParams.get("id")) {
      const movement = await prisma.captureMovement.findFirst({ where: { id: searchParams.get("id"), userId: user.id },
        include: { events: { orderBy: { createdAt: "asc" }, select: { id: true, sourcePackage: true, postedAt: true, receivedAt: true, fields: true } } } });
      if (!movement) throw new ApiAccessError("Aviso no encontrado.", 404);
      return apiResponse.json({ movement, candidates: await captureCandidates(prisma, user.id, effectiveCapture(movement)),
        ...(refundCaptureKind(movement) ? { refundDetail: await refundDetail(prisma, user.id, movement) } : {}),
        ...(paymentCaptureKind(movement) ? { paymentDetail: await capturePaymentDetail(prisma, user.id, movement) } : {}) });
    }
    const scope = { userId: user.id, ...(cardId ? { cardId } : {}) };
    const where = { ...scope, AND: [captureInboxWhere(status), captureKindWhere(kind)] };
    const [rows, counts] = await Promise.all([prisma.captureMovement.findMany({ where,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, include: { expense: { select: { id: true, concept: true, reconciliationStatus: true, reconciledAt: true } },
        installmentPurchase: { select: { id: true, concept: true, reconciliationStatus: true, reconciledAt: true } },
        events: { take: 1, orderBy: { createdAt: "asc" }, select: { sourcePackage: true, receivedAt: true, fields: true } } } }),
      Promise.all(["EXPENSE", "PAYMENT", "REFUND", "OTHER"].map(async type => [type, await prisma.captureMovement.count({ where: { ...scope, AND: [captureInboxWhere("REVIEW"), captureKindWhere(type)] } })])),
    ]);
    return apiResponse.json({ movements: rows.slice(0, 50).map(row => ({ ...row, kind: captureMovementKind(row), inboxState: captureInboxState(row) })),
      pendingCounts: Object.fromEntries(counts), nextCursor: rows.length > 50 ? rows[49].id : null });
  } catch (error) { return apiAccessErrorResponse(error) || apiResponse.json({ error: "No se pudieron consultar los avisos." }, { status: 500 }); }
}

export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    return apiResponse.json({ movement: await resolveCaptureMovement(prisma, user.id, await readCaptureJson(request)) });
  } catch (error) { return apiAccessErrorResponse(error) || apiResponse.json({ error: "No se pudo resolver el aviso. Actualiza para comprobar su estado." }, { status: 500 }); }
}
