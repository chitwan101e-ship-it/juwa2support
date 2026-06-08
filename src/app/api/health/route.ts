import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    deploy: 'DEPLOY-CHECK-2026-06-08-v5',
    vercel: process.env.VERCEL === '1',
  })
}
