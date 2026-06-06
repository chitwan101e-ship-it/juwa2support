import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    deploy: 'DEPLOY-CHECK-2026-06-06-v4',
    vercel: process.env.VERCEL === '1',
  })
}
