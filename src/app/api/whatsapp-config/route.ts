import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    phone: process.env.PLATFORM_WHATSAPP_NUMBER || null,
  });
}
