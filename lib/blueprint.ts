import { db } from '@/lib/db'

// Sends a captured lead on to the 7 Layer Studio blueprint engine, which reads
// the prospect's website and emails them a personalised automation plan.
//
// Two rules govern everything here:
//   1. A webhook failure must NEVER fail the lead. The lead is already saved by
//      the time this runs; losing the blueprint is an inconvenience, losing the
//      lead is lost money.
//   2. It must not hang. On serverless the response is what ends the request, so
//      this is awaited — but on a short leash. The engine replies 202 straight
//      away and does its real work afterwards, so this should take milliseconds.

const TIMEOUT_MS = 5000

type LeadInput = {
  id: string
  widgetId: string
  name: string
  email: string
  interest: string
  conversationId?: string | null
}

/** Rebuilds the chat transcript so the blueprint can be written from what they actually said. */
async function buildTranscript(conversationId?: string | null): Promise<string> {
  if (!conversationId) return ''
  try {
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    })
    return messages
      .map((m: { role: string; content: string }) => {
        const who = m.role === 'user' ? 'visitor' : 'assistant'
        return `${who}: ${m.content}`
      })
      .join('\n')
      .slice(0, 12000)
  } catch (err) {
    console.error('[blueprint] could not load transcript:', err)
    return ''
  }
}

export async function sendToBlueprint(lead: LeadInput, pageUrl?: string): Promise<void> {
  const url = process.env.BLUEPRINT_WEBHOOK_URL
  const secret = process.env.BLUEPRINT_WEBHOOK_SECRET

  // Not configured is a normal state — local dev, or other people's widgets.
  if (!url || !secret) return

  // Only 7 Layer Studio's own widget should trigger this. Without the guard,
  // every client widget on this platform would start emailing their leads a
  // blueprint from Julia, which would be a genuinely bad surprise.
  const onlyWidget = process.env.BLUEPRINT_WIDGET_ID
  if (onlyWidget && lead.widgetId !== onlyWidget) return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const transcript = await buildTranscript(lead.conversationId)

    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify({
        email: lead.email,
        name: lead.name,
        company: '',
        transcript,
        page_url: pageUrl || '',
        // Useful for tracing a blueprint back to the lead row that caused it.
        source_lead_id: lead.id,
      }),
    })

    if (!res.ok) {
      console.error(`[blueprint] engine returned ${res.status} for lead ${lead.id}`)
      return
    }
    console.log(`[blueprint] handed off lead ${lead.id}`)
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timed out' : String(err)
    console.error(`[blueprint] handoff failed for lead ${lead.id}: ${reason}`)
  } finally {
    clearTimeout(timer)
  }
}
