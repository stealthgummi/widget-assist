import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Diagnostic endpoint for the blueprint handoff.
//
// Reports only whether things are CONFIGURED — never a secret's value — plus
// which commit is actually running. Without this, a handoff that silently does
// nothing is indistinguishable from one that was never deployed.
//
// Safe to delete once the integration is confirmed working.

export async function GET() {
  const url = process.env.BLUEPRINT_WEBHOOK_URL
  const secret = process.env.BLUEPRINT_WEBHOOK_SECRET
  const widgetId = process.env.BLUEPRINT_WIDGET_ID

  return NextResponse.json({
    deployedCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
    deployedBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    deployedRepo: process.env.VERCEL_GIT_REPO_SLUG || 'unknown',
    deployedOwner: process.env.VERCEL_GIT_REPO_OWNER || 'unknown',
    environment: process.env.VERCEL_ENV || 'unknown',
    config: {
      webhookUrlSet: Boolean(url),
      // The host is not a secret and confirms it points where we think.
      webhookHost: url ? new URL(url).host : null,
      webhookSecretSet: Boolean(secret),
      webhookSecretLength: secret ? secret.length : 0,
      widgetIdSet: Boolean(widgetId),
      widgetIdTail: widgetId ? widgetId.slice(-6) : null,
    },
  })
}
