import { prisma } from "@/lib/prisma";
import { requireApiUser, apiResponse, apiAccessErrorResponse, ApiAccessError } from "@/lib/apiAuth";
import { resolveCaptureMovement } from "@/lib/captureProcessing";
import { readCaptureJson } from "@/lib/captureProtocol";

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");
    const status = searchParams.get("status");
    if (status && !["REVIEW", "OBSERVED", "REGISTERED", "LINKED", "DISCARDED", "CONVERTED"].includes(status)) throw new ApiAccessError("Estado no válido.", 400);
    if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) throw new ApiAccessError("Página no válida.", 400);
    if (cursor && !await prisma.captureMovement.findFirst({ where: { id: cursor, userId: user.id } })) throw new ApiAccessError("Página no encontrada.", 404);
    const rows = await prisma.captureMovement.findMany({ where: { userId: user.id, ...(status ? { status } : {}) },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, include: { expense: { select: { id: true, concept: true, reconciliationStatus: true } },
        events: { take: 1, orderBy: { createdAt: "asc" }, select: { sourcePackage: true, receivedAt: true, fields: true } } } });
    return apiResponse.json({ movements: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null });
  } catch (error) { return apiAccessErrorResponse(error) || apiResponse.json({ error: "No se pudieron consultar los avisos." }, { status: 500 }); }
}

export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    return apiResponse.json({ movement: await resolveCaptureMovement(prisma, user.id, await readCaptureJson(request)) });
  } catch (error) { return apiAccessErrorResponse(error) || apiResponse.json({ error: "No se pudo resolver el aviso. Actualiza para comprobar su estado." }, { status: 500 }); }
}
