import { captureRequest } from "@/lib/captureApi";

export function GET(request: Request) { return captureRequest(request, "status"); }
export function POST(request: Request) { return captureRequest(request, "device-change"); }
export function DELETE(request: Request) { return captureRequest(request, "unlink"); }
