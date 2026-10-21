import { captureRequest } from "@/lib/captureApi";

export function POST(request) { return captureRequest(request, "event"); }
