import { NextResponse } from 'next/server';
import { AuthError } from './auth';

export function ok(data: unknown, status = 200) { return NextResponse.json(data, { status }); }
export function fail(error: unknown) {
  console.error(error);
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : 'Something went wrong';
  const status = message.includes('overlap') || message.includes('booked') ? 409 : 400;
  return NextResponse.json({ error: message }, { status });
}
