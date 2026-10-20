import asyncio
import json
from datetime import datetime
from typing import Any

import httpx
import structlog
from redis.asyncio import Redis

from app.config import settings
from app.core.redis import get_redis

logger = structlog.get_logger(__name__)

EMAIL_QUEUE_KEY = "user:email_queue"


def get_base_html(content: str, preview_text: str = "") -> str:
    """Generates standard branded HTML email shell in Silver, Obsidian Black, and Stark White."""
    current_year = datetime.now().year
    app_url = settings.frontend_base_url.rstrip("/") if settings.frontend_base_url else "https://thinkaloudai.tech"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>ThinkAloudAI</title>
    <style>
        body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
        body {{
            margin: 0 !important;
            padding: 0 !important;
            background-color: #050508 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: #E4E4E7;
        }}
        @media only screen and (max-width: 620px) {{
            .email-container {{ width: 100% !important; padding: 16px 8px !important; }}
            .content-card {{ padding: 28px 20px !important; }}
            .otp-code {{ font-size: 28px !important; letter-spacing: 8px !important; padding: 14px 20px !important; }}
        }}
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #050508; color: #E4E4E7;">
    <div style="display: none; font-size: 1px; color: #050508; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        {preview_text}
    </div>
    <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#050508" style="background-color: #050508;">
        <tr>
            <td align="center" style="padding: 40px 12px;">
                <table class="email-container" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 580px; margin: 0 auto;">
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <a href="{app_url}" target="_blank" style="text-decoration: none; display: inline-block;">
                                <table border="0" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 9999px; padding: 10px 24px;">
                                            <span style="font-size: 15px; font-weight: 800; color: #FFFFFF; letter-spacing: 1px; text-transform: uppercase;">THINKALOUD <span style="color: #71717A; font-weight: 500;">/ AI</span></span>
                                        </td>
                                    </tr>
                                </table>
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <table class="content-card" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #0D0D12; border: 1px solid rgba(255, 255, 255, 0.10); border-radius: 16px; padding: 42px 38px; box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.85);">
                                <tr>
                                    <td>
                                        {content}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-top: 36px; padding-bottom: 24px; text-align: center;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="center" style="padding-bottom: 16px;">
                                        <a href="{app_url}" style="color: #8E8E93; text-decoration: none; font-size: 13px; font-weight: 500; margin: 0 10px;">Platform</a>
                                        <span style="color: #27272A;">&bull;</span>
                                        <a href="{app_url}/practice" style="color: #8E8E93; text-decoration: none; font-size: 13px; font-weight: 500; margin: 0 10px;">DSA Practice</a>
                                        <span style="color: #27272A;">&bull;</span>
                                        <a href="mailto:support@thinkaloudai.tech" style="color: #FFFFFF; text-decoration: none; font-size: 13px; font-weight: 500; margin: 0 10px;">Support</a>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="font-size: 12px; line-height: 1.6; color: #52525B;">
                                        &copy; {current_year} ThinkAloudAI. Architectural Technical Interview Intelligence.<br>
                                        This is an automated transactional security message for your account.
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


def get_verification_email_html(otp: str) -> str:
    """Renders verification OTP email template in monochrome luxury styling."""
    preview = f"Your ThinkAloudAI verification code is {otp}. Valid for 15 minutes."
    content = f"""
        <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
            <tr>
                <td style="background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 9999px; padding: 4px 14px;">
                    <span style="color: #E4E4E7; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px;">Account Verification</span>
                </td>
            </tr>
        </table>
        <h1 style="margin: 0 0 14px 0; font-size: 24px; font-weight: 700; color: #FFFFFF; line-height: 1.3; letter-spacing: -0.3px;">
            Verify your email address
        </h1>
        <p style="margin: 0 0 28px 0; font-size: 14.5px; line-height: 1.65; color: #A1A1AA;">
            Welcome to <strong style="color: #FFFFFF;">ThinkAloudAI</strong>. Enter the 6-digit verification code below to confirm your identity and activate your account.
        </p>
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 30px 0 20px 0;">
            <tr>
                <td align="center">
                    <div style="background: #000000; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px; padding: 22px 34px; display: inline-block; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);">
                        <div class="otp-code" style="font-family: 'SF Mono', Monaco, Menlo, 'Courier New', monospace; font-size: 34px; font-weight: 800; color: #FFFFFF; letter-spacing: 12px; text-indent: 12px;">
                            {otp}
                        </div>
                    </div>
                </td>
            </tr>
            <tr>
                <td align="center" style="padding-top: 14px;">
                    <span style="font-size: 12px; color: #71717A; letter-spacing: 0.2px;">Valid for <strong style="color: #E4E4E7; font-weight: 600;">15 minutes</strong>. Do not share this code.</span>
                </td>
            </tr>
        </table>
        <p style="margin: 26px 0 0 0; font-size: 12px; line-height: 1.5; color: #52525B; text-align: center;">
            If you did not create a ThinkAloudAI account, you can safely disregard this message.
        </p>
    """
    return get_base_html(content, preview_text=preview)


def get_password_reset_email_html(otp: str) -> str:
    """Renders password reset OTP email template in monochrome luxury styling."""
    preview = f"Your ThinkAloudAI password reset code is {otp}. Valid for 15 minutes."
    content = f"""
        <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
            <tr>
                <td style="background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 9999px; padding: 4px 14px;">
                    <span style="color: #E4E4E7; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px;">Security & Password</span>
                </td>
            </tr>
        </table>
        <h1 style="margin: 0 0 14px 0; font-size: 24px; font-weight: 700; color: #FFFFFF; line-height: 1.3; letter-spacing: -0.3px;">
            Reset your password
        </h1>
        <p style="margin: 0 0 28px 0; font-size: 14.5px; line-height: 1.65; color: #A1A1AA;">
            We received a request to reset the password for your <strong style="color: #FFFFFF;">ThinkAloudAI</strong> account. Use the authorization code below to establish a new password.
        </p>
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 30px 0 20px 0;">
            <tr>
                <td align="center">
                    <div style="background: #000000; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px; padding: 22px 34px; display: inline-block; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);">
                        <div class="otp-code" style="font-family: 'SF Mono', Monaco, Menlo, 'Courier New', monospace; font-size: 34px; font-weight: 800; color: #FFFFFF; letter-spacing: 12px; text-indent: 12px;">
                            {otp}
                        </div>
                    </div>
                </td>
            </tr>
            <tr>
                <td align="center" style="padding-top: 14px;">
                    <span style="font-size: 12px; color: #71717A; letter-spacing: 0.2px;">Valid for <strong style="color: #E4E4E7; font-weight: 600;">15 minutes</strong>. If you did not request this, contact support.</span>
                </td>
            </tr>
        </table>
    """
    return get_base_html(content, preview_text=preview)


def get_welcome_email_html(full_name: str) -> str:
    """Renders welcome onboarding email template in monochrome luxury styling."""
    app_url = settings.frontend_base_url.rstrip("/") if settings.frontend_base_url else "https://thinkaloudai.tech"
    name = full_name.strip() if full_name else "there"
    preview = f"Welcome to ThinkAloudAI, {name}. Your account is ready for technical interviews."

    content = f"""
        <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
            <tr>
                <td style="background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 9999px; padding: 4px 14px;">
                    <span style="color: #E4E4E7; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px;">Account Ready</span>
                </td>
            </tr>
        </table>
        <h1 style="margin: 0 0 14px 0; font-size: 26px; font-weight: 800; color: #FFFFFF; line-height: 1.3; letter-spacing: -0.4px;">
            Welcome to ThinkAloudAI, {name}
        </h1>
        <p style="margin: 0 0 28px 0; font-size: 14.5px; line-height: 1.65; color: #A1A1AA;">
            Your account is confirmed. You now have full access to our ultra low-latency conversational AI interviewer, live code execution sandbox, and structured rubric analytics.
        </p>
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 32px 0 20px 0;">
            <tr>
                <td align="center">
                    <a href="{app_url}/dashboard" target="_blank" style="background: #FFFFFF; color: #050508; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 9999px; display: inline-block; letter-spacing: 0.3px; box-shadow: 0 4px 20px rgba(255, 255, 255, 0.12);">
                        Enter Workspace &rarr;
                    </a>
                </td>
            </tr>
        </table>
    """
    return get_base_html(content, preview_text=preview)


def get_interview_invitation_email_html(
    candidate_name: str,
    interview_type: str,
    scheduled_at: str | None,
    invite_url: str,
) -> str:
    name = candidate_name.strip() or "Candidate"
    track_title = interview_type.replace("_", " ").title()
    preview = f"You've been invited to a {track_title} interview on ThinkAloudAI."
    sched_info = f"<p style='margin: 0 0 18px 0; font-size: 14px; color: #E4E4E7;'><strong>Scheduled Time:</strong> {scheduled_at}</p>" if scheduled_at else ""

    content = f"""
        <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
            <tr>
                <td style="background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 9999px; padding: 4px 14px;">
                    <span style="color: #E4E4E7; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px;">Interview Invitation</span>
                </td>
            </tr>
        </table>
        <h1 style="margin: 0 0 14px 0; font-size: 26px; font-weight: 800; color: #FFFFFF; line-height: 1.3; letter-spacing: -0.4px;">
            Hello, {name}
        </h1>
        <p style="margin: 0 0 20px 0; font-size: 14.5px; line-height: 1.65; color: #A1A1AA;">
            You have been invited to a <strong style="color: #FFFFFF;">{track_title}</strong> mock interview session on ThinkAloudAI.
        </p>
        {sched_info}
        <p style="margin: 0 0 28px 0; font-size: 14px; line-height: 1.6; color: #71717A;">
            No account registration is required. Ensure you are on a desktop browser with your microphone and camera configured prior to launching your session.
        </p>
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 24px 0;">
            <tr>
                <td align="center">
                    <a href="{invite_url}" target="_blank" style="background: #FFFFFF; color: #050508; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 9999px; display: inline-block; letter-spacing: 0.3px; box-shadow: 0 4px 20px rgba(255, 255, 255, 0.12);">
                        Join Interview Room &rarr;
                    </a>
                </td>
            </tr>
        </table>
        <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 1.5; color: #71717A; word-break: break-all; text-align: center;">
            Direct URL: <a href="{invite_url}" style="color: #A1A1AA; text-decoration: underline;">{invite_url}</a>
        </p>
    """
    return get_base_html(content, preview_text=preview)


def get_interview_report_email_html(
    candidate_name: str,
    interview_type: str,
    overall_score: int,
    tech_score: int,
    comm_score: int,
    eng_score: int,
    strengths: list[str],
    weaknesses: list[str],
    executive_summary: str = "",
) -> str:
    name = candidate_name.strip() or "Candidate"
    track_title = interview_type.replace("_", " ").title()
    preview = f"ThinkAloudAI Evaluation Scorecard: {overall_score}/100 in {track_title}"

    strengths_html = "".join([f"<li style='margin-bottom: 8px; color: #D4D4D8;'>{s}</li>" for s in strengths[:4]]) if strengths else "<li style='color: #A1A1AA;'>Demonstrated solid foundational problem-solving approach.</li>"
    growth_html = "".join([f"<li style='margin-bottom: 8px; color: #A1A1AA;'>{w}</li>" for w in weaknesses[:4]]) if weaknesses else "<li style='color: #71717A;'>Focus on active communication and edge-case testing.</li>"
    summary_html = f"<div style='margin: 0 0 24px 0; font-size: 14px; line-height: 1.65; color: #D4D4D8; background: #000000; padding: 16px 20px; border-radius: 8px; border-left: 2px solid #FFFFFF;'>{executive_summary}</div>" if executive_summary else ""

    content = f"""
        <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
            <tr>
                <td style="background-color: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 9999px; padding: 4px 14px;">
                    <span style="color: #E4E4E7; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px;">Performance Evaluation</span>
                </td>
            </tr>
        </table>
        <h1 style="margin: 0 0 14px 0; font-size: 26px; font-weight: 800; color: #FFFFFF; line-height: 1.3; letter-spacing: -0.4px;">
            Hello, {name}
        </h1>
        <p style="margin: 0 0 26px 0; font-size: 14.5px; line-height: 1.65; color: #A1A1AA;">
            Here is your comprehensive evaluation breakdown for the <strong style="color: #FFFFFF;">{track_title}</strong> interview on ThinkAloudAI:
        </p>

        <!-- Score Overview Grid -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 26px; background: #000000; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; padding: 18px 8px;">
            <tr>
                <td align="center" style="padding: 12px; border-right: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="font-size: 11px; text-transform: uppercase; color: #71717A; font-weight: 600; letter-spacing: 1px; margin-bottom: 6px;">Overall</div>
                    <div style="font-size: 32px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.5px;">{overall_score}<span style="font-size: 13px; color: #71717A; font-weight: 400;">/100</span></div>
                </td>
                <td align="center" style="padding: 12px; border-right: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="font-size: 11px; text-transform: uppercase; color: #71717A; font-weight: 600; letter-spacing: 1px; margin-bottom: 6px;">Technical</div>
                    <div style="font-size: 22px; font-weight: 700; color: #F4F4F5;">{tech_score}<span style="font-size: 12px; color: #71717A; font-weight: 400;">/100</span></div>
                </td>
                <td align="center" style="padding: 12px; border-right: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="font-size: 11px; text-transform: uppercase; color: #71717A; font-weight: 600; letter-spacing: 1px; margin-bottom: 6px;">Communication</div>
                    <div style="font-size: 22px; font-weight: 700; color: #F4F4F5;">{comm_score}<span style="font-size: 12px; color: #71717A; font-weight: 400;">/100</span></div>
                </td>
                <td align="center" style="padding: 12px;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #71717A; font-weight: 600; letter-spacing: 1px; margin-bottom: 6px;">Proficiency</div>
                    <div style="font-size: 22px; font-weight: 700; color: #F4F4F5;">{eng_score}<span style="font-size: 12px; color: #71717A; font-weight: 400;">/100</span></div>
                </td>
            </tr>
        </table>

        {summary_html}

        <!-- Strengths -->
        <div style="margin-bottom: 22px;">
            <div style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #FFFFFF; text-transform: uppercase; letter-spacing: 1px;">
                Key Strengths
            </div>
            <ul style="margin: 0; padding-left: 20px; font-size: 13.5px; line-height: 1.65;">
                {strengths_html}
            </ul>
        </div>

        <!-- Growth Areas -->
        <div style="margin-bottom: 26px;">
            <div style="margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #A1A1AA; text-transform: uppercase; letter-spacing: 1px;">
                Growth Focus
            </div>
            <ul style="margin: 0; padding-left: 20px; font-size: 13.5px; line-height: 1.65;">
                {growth_html}
            </ul>
        </div>

        <p style="margin: 24px 0 0 0; font-size: 12px; line-height: 1.5; color: #52525B; text-align: center;">
            This automated performance evaluation was synthesized by ThinkAloudAI's Rubric Engine.
        </p>
    """
    return get_base_html(content, preview_text=preview)


async def send_email_via_resend(to_email: str, subject: str, html_content: str) -> dict[str, Any] | None:
    """
    Sends an email using Resend's REST API asynchronously via httpx.
    """
    api_key = settings.resend_api_key.strip().strip("'\"") if settings.resend_api_key else ""
    from_email = settings.email_from.strip().strip("'\"") if settings.email_from else "ThinkAloudAI <onboarding@resend.dev>"
    if "example.com" in from_email:
        from_email = "ThinkAloudAI <onboarding@resend.dev>"

    if not api_key:
        logger.warning(
            "resend_api_key_missing_simulating_email",
            to_email=to_email,
            subject=subject,
        )
        return {"status": "simulated", "to": to_email}

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_content,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                json=payload,
                headers=headers,
            )
            if response.status_code >= 400:
                logger.error(
                    "resend_api_error_response",
                    status_code=response.status_code,
                    body=response.text,
                    to_email=to_email,
                )
            response.raise_for_status()
            data = response.json()
            logger.info("email_sent_successfully", message_id=data.get("id"), to=to_email, subject=subject)
            return data
    except Exception as e:
        logger.error("email_send_failed", error=str(e), to=to_email, subject=subject)
        raise e


async def process_email(task_type: str, to_email: str, payload: dict[str, Any]) -> None:
    """Renders HTML template and sends transactional email."""
    otp = payload.get("otp", "")
    full_name = payload.get("full_name", "")

    if task_type == "verification_email":
        subject = f"Your ThinkAloudAI verification code: {otp}"
        html = get_verification_email_html(otp)
    elif task_type == "password_reset_email":
        subject = f"Your ThinkAloudAI password reset code: {otp}"
        html = get_password_reset_email_html(otp)
    elif task_type == "welcome_email":
        subject = "Welcome to ThinkAloudAI!"
        html = get_welcome_email_html(full_name)
    elif task_type == "interview_invitation":
        track = payload.get("interview_type", "interview").replace("_", " ").title()
        subject = f"Interview Invitation: {track} on ThinkAloudAI"
        html = get_interview_invitation_email_html(
            candidate_name=payload.get("candidate_name", "Candidate"),
            interview_type=payload.get("interview_type", "interview"),
            scheduled_at=payload.get("scheduled_at"),
            invite_url=payload.get("invite_url", ""),
        )
    elif task_type == "interview_report":
        track = payload.get("interview_type", "interview").replace("_", " ").title()
        score = payload.get("overall_score", 0)
        subject = f"Your ThinkAloudAI Interview Report: {track} ({score}/100)"
        html = get_interview_report_email_html(
            candidate_name=payload.get("candidate_name", "Candidate"),
            interview_type=payload.get("interview_type", "interview"),
            overall_score=payload.get("overall_score", 0),
            tech_score=payload.get("tech_score", 0),
            comm_score=payload.get("comm_score", 0),
            eng_score=payload.get("eng_score", 0),
            strengths=payload.get("strengths", []),
            weaknesses=payload.get("weaknesses", []),
            executive_summary=payload.get("executive_summary", ""),
        )
    else:
        logger.warning("unknown_email_task_type", task_type=task_type, to=to_email)
        return

    await send_email_via_resend(to_email, subject, html)


async def send_interview_invitation_email(
    to_email: str,
    candidate_name: str,
    interview_type: str,
    scheduled_at: Any,
    invite_url: str,
) -> None:
    """Dispatches or queues candidate interview invitation email."""
    sched_str = str(scheduled_at) if scheduled_at else None
    await enqueue_email(
        task_type="interview_invitation",
        email=to_email,
        payload={
            "candidate_name": candidate_name,
            "interview_type": interview_type,
            "scheduled_at": sched_str,
            "invite_url": invite_url,
        },
    )


async def send_interview_report_email(
    to_email: str,
    candidate_name: str,
    interview_type: str,
    overall_score: int,
    tech_score: int,
    comm_score: int,
    eng_score: int,
    strengths: list[str],
    weaknesses: list[str],
    executive_summary: str = "",
) -> None:
    """Dispatches or queues post-interview scorecard email directly to the candidate."""
    await enqueue_email(
        task_type="interview_report",
        email=to_email,
        payload={
            "candidate_name": candidate_name,
            "interview_type": interview_type,
            "overall_score": overall_score,
            "tech_score": tech_score,
            "comm_score": comm_score,
            "eng_score": eng_score,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "executive_summary": executive_summary,
        },
    )


async def enqueue_email(task_type: str, email: str, payload: dict[str, Any]) -> None:
    """Enqueues email task immediately with Redis fallback."""
    logger.info("dispatching_email_task", task_type=task_type, email=email)
    try:
        await process_email(task_type, email, payload)
    except Exception as err:
        logger.error("direct_email_send_error", error=str(err), task_type=task_type, email=email)
        try:
            redis: Redis = await get_redis()
            task = {
                "type": task_type,
                "email": email,
                "payload": payload,
            }
            await redis.rpush(EMAIL_QUEUE_KEY, json.dumps(task))
            logger.info("email_task_requeued_to_redis", task_type=task_type, email=email)
        except Exception as queue_err:
            logger.error("redis_requeue_failed", error=str(queue_err), task_type=task_type, email=email)


async def email_worker_loop(stop_event: asyncio.Event) -> None:
    """Background worker loop that continuously pops and processes queued emails from Redis."""
    logger.info("email_worker_started")
    while not stop_event.is_set():
        try:
            redis: Redis = await get_redis()
            item = await redis.blpop(EMAIL_QUEUE_KEY, timeout=2)
            if item:
                _, raw_data = item
                task = json.loads(raw_data)
                task_type = task.get("type", "")
                email = task.get("email", "")
                payload = task.get("payload", {})

                try:
                    await process_email(task_type, email, payload)
                except Exception as send_err:
                    logger.error("email_worker_send_error", error=str(send_err), task_type=task_type, email=email)
        except asyncio.CancelledError:
            break
        except Exception as e:
            if not stop_event.is_set():
                logger.error("email_worker_loop_error", error=str(e))
                await asyncio.sleep(2)
    logger.info("email_worker_stopped")
