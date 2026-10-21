import { captureRequest } from "@/lib/captureApi";

export function GET(request) { return captureRequest(request, "status"); }
export function POST(request) { return captureRequest(request, "device-change"); }
export function DELETE(request) { return captureRequest(request, "unlink"); }
