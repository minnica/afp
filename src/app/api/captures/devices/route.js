import { captureRequest } from "@/lib/captureApi";

export function GET(request) { return captureRequest(request, "list"); }
export function PATCH(request) { return captureRequest(request, "change"); }
