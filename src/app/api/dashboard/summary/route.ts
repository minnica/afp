import { loadDashboard } from '@/lib/dashboardReader';
export async function GET(request: Request) { return loadDashboard(request, true); }
