import { requireUser } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { loadOperationalReport, parseReportFilters } from '@/lib/reports';

export async function GET(request:Request) {
  try {
    const user = await requireUser();
    const report = await loadOperationalReport(user, parseReportFilters(request));
    return ok({ report });
  } catch (error) { return fail(error); }
}
