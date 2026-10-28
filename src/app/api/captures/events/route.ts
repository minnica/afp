import { captureRequest } from "@/lib/captureApi";

export function POST(request: Request) { return captureRequest(request, "event"); }
