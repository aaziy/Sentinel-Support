"""Email notification service via Resend.

Sends resolution notifications to customers when their escalated
ticket is resolved by an admin.

Setup:
  1. Sign up at https://resend.com (free — 3 000 emails/month)
  2. Create an API key
  3. Set RESEND_API_KEY in backend/.env
  4. Optionally verify a sending domain and set SUPPORT_FROM_EMAIL
     (without verification, Resend allows sending from onboarding@resend.dev)
"""
from __future__ import annotations

import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _html_template(ticket_id: str, original_query: str, resolution: str, brand: str) -> str:
    short_id = ticket_id[:8].upper()
    # Escape basic HTML entities
    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your support ticket has been resolved</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 24px;">
        <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:32px;" align="center">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">{esc(brand)}</span>
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#18181b;border:1px solid rgba(255,255,255,0.07);border-radius:16px;overflow:hidden;">

              <!-- Accent bar -->
              <div style="height:3px;background:linear-gradient(90deg,#7C5CFC,#a78bfa);"></div>

              <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px;">
                <tr>
                  <td>
                    <!-- Status badge -->
                    <div style="display:inline-block;background:rgba(124,92,252,0.1);border:1px solid rgba(124,92,252,0.2);border-radius:6px;padding:4px 12px;margin-bottom:20px;">
                      <span style="font-size:11px;font-weight:600;color:#a78bfa;letter-spacing:0.08em;text-transform:uppercase;">✓ Ticket Resolved</span>
                    </div>

                    <!-- Headline -->
                    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f4f4f5;line-height:1.3;">
                      We&rsquo;ve got an answer for you
                    </h1>
                    <p style="margin:0 0 28px;font-size:14px;color:#71717a;line-height:1.6;">
                      Your support request has been reviewed and resolved by our team.
                    </p>

                    <!-- Ticket ID -->
                    <div style="background:#09090b;border-radius:8px;padding:10px 14px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;">
                      <span style="font-family:monospace;font-size:11px;color:#52525b;">Ticket ID</span>
                      <span style="font-family:monospace;font-size:13px;font-weight:700;color:#7C5CFC;">{short_id}</span>
                    </div>

                    <!-- Original question -->
                    <div style="margin-bottom:16px;">
                      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#52525b;letter-spacing:0.06em;text-transform:uppercase;">Your Question</p>
                      <div style="background:#09090b;border-left:3px solid rgba(124,92,252,0.4);border-radius:0 8px 8px 0;padding:12px 16px;">
                        <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.6;">{esc(original_query)}</p>
                      </div>
                    </div>

                    <!-- Resolution -->
                    <div style="margin-bottom:28px;">
                      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#52525b;letter-spacing:0.06em;text-transform:uppercase;">Resolution</p>
                      <div style="background:#09090b;border-radius:8px;padding:16px;">
                        <p style="margin:0;font-size:14px;color:#e4e4e7;line-height:1.7;">{esc(resolution)}</p>
                      </div>
                    </div>

                    <!-- Divider -->
                    <div style="height:1px;background:rgba(255,255,255,0.06);margin-bottom:24px;"></div>

                    <!-- Footer note -->
                    <p style="margin:0;font-size:12px;color:#52525b;line-height:1.6;text-align:center;">
                      If you have further questions, simply reply to this email or start a new chat at your support portal.<br>
                      <span style="color:#3f3f46;">— {esc(brand)} Team</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;" align="center">
              <p style="margin:0;font-size:11px;color:#3f3f46;">
                Powered by {esc(brand)} &middot; AI-powered support
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_resolution_email(
    to_email: str,
    ticket_id: str,
    original_query: str,
    resolution: str,
) -> dict:
    """Send a ticket resolution email to the customer.

    Returns a dict with keys: ok (bool), message_id or error.
    Silently degrades if RESEND_API_KEY is not configured.
    """
    api_key = settings.RESEND_API_KEY
    brand = settings.SUPPORT_BRAND_NAME
    from_email = settings.SUPPORT_FROM_EMAIL

    if not api_key:
        logger.warning(
            "RESEND_API_KEY not set — skipping resolution email for ticket %s", ticket_id
        )
        return {"ok": False, "error": "RESEND_API_KEY not configured"}

    try:
        import resend  # type: ignore
        resend.api_key = api_key

        short_id = ticket_id[:8].upper()
        html = _html_template(ticket_id, original_query, resolution, brand)

        params: resend.Emails.SendParams = {
            "from": f"{brand} <{from_email}>",
            "to": [to_email],
            "subject": f"[{short_id}] Your support request has been resolved",
            "html": html,
        }

        response = resend.Emails.send(params)
        message_id = getattr(response, "id", None) or str(response)
        logger.info("Resolution email sent to %s (ticket %s) — id: %s", to_email, ticket_id, message_id)
        return {"ok": True, "message_id": message_id}

    except Exception as exc:
        logger.error("Failed to send resolution email for ticket %s: %s", ticket_id, exc)
        return {"ok": False, "error": str(exc)}
