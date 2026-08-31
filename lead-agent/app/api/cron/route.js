import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';

// Force Next.js to ALWAYS execute this route completely fresh 
export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Calculate exactly one hour ago dynamically on EVERY run
  // This ensures we only ask the Vercel app for leads created strictly within the last hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const WIDGET_API_URL = `https://widget-assist.vercel.app/api/leads?widgetId=cmn6ujhea00015cejfz57dmv6&since=${oneHourAgo}`;

  // 1. Verify cron request (optional, but highly recommended)
  // Hostinger cron will pass the Authorization header with this secret.
  if (
    process.env.CRON_SECRET && 
    request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Fetch the newly filtered leads from your Widget Assist dashboard
    const response = await fetch(WIDGET_API_URL, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch leads: ${response.statusText}`);
    }
    
    const data = await response.json();
    const newLeads = data.leads || [];

    if (newLeads.length === 0) {
      return NextResponse.json({ message: 'No new leads to process in the last hour.' });
    }

    // 3. Setup Hostinger SMTP Transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_EMAIL, // e.g., inquiries@vpvgalleries.com
        pass: process.env.SMTP_PASSWORD, // Replace via .env variables
      },
      tls: {
       rejectUnauthorized: false
      }
    });

    // 5. Build one combined email containing all new leads
    const leadsHtml = newLeads.map((lead, index) => `
      <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid #ccc;">
        <h3 style="margin-top: 0; color: #333;">Lead #${index + 1}</h3>
        <p style="margin: 4px 0;"><strong>Name:</strong> ${lead.name || 'N/A'}</p>
        <p style="margin: 4px 0;"><strong>Email:</strong> ${lead.email || 'N/A'}</p>
        <p style="margin: 4px 0;"><strong>Phone:</strong> ${lead.phone || 'N/A'}</p>
        <p style="margin: 4px 0;"><strong>Message:</strong> ${lead.message || lead.content || 'N/A'}</p>
      </div>
    `).join('');

    // Send the single bundled email
    await transporter.sendMail({
      from: `"The Curator" <${process.env.SMTP_EMAIL}>`, // Must match authenticated user
      to: 'inquiries@vpvgalleries.com',         // Destination inbox
      subject: `🎨 ${newLeads.length} New Inquiry(s) for VPV Galleries`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd;">
          <h2 style="color: #c2a878;">New Leads Captured by The Curator!</h2>
          <p>You have received ${newLeads.length} new inquiry(s) from the chat widget on vpvgalleries.com:</p>
          <hr style="border-top: 2px solid #c2a878; margin-bottom: 25px;"/>
          
          ${leadsHtml}
          
          <p style="font-size: 0.8rem; color: #999; margin-top: 20px;"><em>This is an automated notification securely fetched and delivered via Hostinger SMTP.</em></p>
        </div>
      `
    });

    // We no longer need the fallback cache saving mechanism! Every run only reads the DB time correctly.

    return NextResponse.json({ 
      message: `Successfully processed and emailed ${newLeads.length} new leads via Hostinger SMTP.` 
    });

  } catch (error) {
    console.error('Lead Agent Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
