import { captureRequest } from "@/lib/captureApi";

export function GET(request: Request) { return captureRequest(request, "list"); }
export function PATCH(request: Request) { return captureRequest(request, "change"); }
