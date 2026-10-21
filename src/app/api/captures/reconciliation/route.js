import { prisma } from "@/lib/prisma";
import { requireApiUser, apiResponse, apiAccessErrorResponse } from "@/lib/apiAuth";
import { readCaptureJson } from "@/lib/captureProtocol";
import { captureStatement, reconcileCaptureStatement } from "@/lib/captureReconciliation";

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    return apiResponse.json(await captureStatement(prisma, user.id, Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) { return apiAccessErrorResponse(error) || apiResponse.json({ error: "No se pudo consultar el cotejo." }, { status: 500 }); }
}
export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    return apiResponse.json(await reconcileCaptureStatement(prisma, user.id, await readCaptureJson(request, 16384)));
  } catch (error) { return apiAccessErrorResponse(error) || apiResponse.json({ error: "No se pudo guardar el cotejo. Actualiza para comprobarlo." }, { status: 500 }); }
}
