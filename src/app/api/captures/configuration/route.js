import { prisma } from "@/lib/prisma";
import { requireApiUser, apiResponse, apiAccessErrorResponse } from "@/lib/apiAuth";
import { captureConfiguration, configureCapture } from "@/lib/captureConfiguration";
import { readCaptureJson } from "@/lib/captureProtocol";

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    return apiResponse.json(await captureConfiguration(prisma, user.id));
  } catch (error) { return apiAccessErrorResponse(error) || apiResponse.json({ error: "No se pudo consultar la configuración de captura." }, { status: 500 }); }
}

export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    return apiResponse.json(await configureCapture(prisma, user.id, await readCaptureJson(request, 65536)));
  } catch (error) { return apiAccessErrorResponse(error) || apiResponse.json({ error: "No se pudo guardar la configuración de captura." }, { status: 500 }); }
}
