import { captureRequest } from "@/lib/captureApi";

export function POST(request) { return captureRequest(request, "start"); }
export function PATCH(request) { return captureRequest(request, "approve"); }
