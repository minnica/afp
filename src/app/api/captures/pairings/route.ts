import { captureRequest } from "@/lib/captureApi";

export function POST(request: Request) { return captureRequest(request, "start"); }
export function PATCH(request: Request) { return captureRequest(request, "approve"); }
