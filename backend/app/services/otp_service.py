"""OTP generation, hashing, verification, and SMS delivery stub."""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.services.database import db_create_otp, db_invalidate_user_otps

logger = logging.getLogger(__name__)


def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP string."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def verify_otp_hash(otp: str, stored_hash: str) -> bool:
    """Timing-safe OTP hash comparison."""
    return hmac.compare_digest(hash_otp(otp), stored_hash)


def send_otp_sms(phone_number: str, otp: str) -> None:
    """Send OTP via SMS. Uses Azure Communication Services when configured; logs in dev."""
    if settings.azure_communication_endpoint and settings.azure_communication_key:
        # --- Azure Communication Services (uncomment when credentials are available) ---
        # from azure.communication.sms import SmsClient
        # from azure.core.credentials import AzureKeyCredential
        # client = SmsClient(
        #     endpoint=settings.azure_communication_endpoint,
        #     credential=AzureKeyCredential(settings.azure_communication_key),
        # )
        # client.send(
        #     from_="<ACS_PHONE_NUMBER>",
        #     to=[phone_number],
        #     message=f"Your RAG Builder verification code is: {otp}. Valid for 10 minutes.",
        # )
        # logger.info("OTP SMS sent to %s via Azure Communication Services", phone_number)
        logger.info("[DEV] ACS credentials found but SMS stub not wired — OTP for %s: %s", phone_number, otp)
    else:
        logger.info("[DEV] OTP for %s: %s", phone_number, otp)


async def create_and_send_otp(user_id: str, phone_number: str) -> None:
    """Invalidate any pending OTPs, create a new one, and send it via SMS."""
    await db_invalidate_user_otps(user_id)

    otp = generate_otp()
    otp_hash = hash_otp(otp)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.otp_expire_minutes)

    await db_create_otp(user_id, otp_hash, otp, phone_number, expires_at)
    send_otp_sms(phone_number, otp)
