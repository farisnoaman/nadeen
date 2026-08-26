import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { createReportExcel, createReportPdf } from '@/lib/report-export';
import { loadOperationalReport, parseReportFilters } from '@/lib/reports';

export async function GET(request:Request) {
  try {
    const user=await requireUser();
    const url=new URL(request.url);
    const format=url.searchParams.get('format')==='excel'?'excel':'pdf';
    if(user.role==='renter'&&format==='excel') throw new Error('Personal dashboards can be exported as PDF or printed.');
    const report=await loadOperationalReport(user,parseReportFilters(request));
    const locale=(await cookies()).get('ff_lang')?.value==='ar'?'ar':'en';
    if(format==='excel'){
      const workbook=createReportExcel(report);
      return new Response(workbook as BodyInit,{headers:{
        'Content-Type':'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition':`attachment; filename="${report.reportNumber}.xls"`,
        'Cache-Control':'private, no-store',
      }});
    }
    const pdf=await createReportPdf(report,locale);
    return new Response(pdf as BodyInit,{headers:{
      'Content-Type':'application/pdf',
      'Content-Disposition':`attachment; filename="${report.reportNumber}.pdf"`,
      'Cache-Control':'private, no-store',
    }});
  }catch(error:any){return Response.json({error:error.message||'Unable to export report'},{status:400})}
}
