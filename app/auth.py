"""The owner's passkey (WebAuthn) and the admin checks shared by the admin routes.

There is one passkey. It is registered once from `/admin#setup=<SITE_ENROLLMENT_TOKEN>`;
after that registration is closed. Signed-in state lives in the signed session cookie,
which only the admin pages set: visitors get no cookie.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlmodel import select
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import (
    base64url_to_bytes,
    bytes_to_base64url,
    options_to_json_dict,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import get_settings
from app.db import ApiToken, Credential, one_credential, session

OWNER = "owner"


def registration_options() -> tuple[dict, str]:
    settings = get_settings()
    options = generate_registration_options(
        rp_id=settings.rp_id,
        rp_name="Fried Schölvinck",
        user_name=OWNER,
        user_display_name="Site owner",
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    return options_to_json_dict(options), bytes_to_base64url(options.challenge)


def finish_registration(credential: dict, challenge: str) -> None:
    settings = get_settings()
    verified = verify_registration_response(
        credential=credential,
        expected_challenge=base64url_to_bytes(challenge),
        expected_rp_id=settings.rp_id,
        expected_origin=settings.origin,
        require_user_verification=True,
    )
    with session() as db:
        if db.exec(select(Credential)).first() is not None:
            raise PermissionError("A passkey is already registered")
        db.add(
            Credential(
                credential_id=bytes_to_base64url(verified.credential_id),
                public_key=bytes_to_base64url(verified.credential_public_key),
                sign_count=verified.sign_count,
            )
        )
        db.commit()


def authentication_options() -> tuple[dict, str]:
    current = one_credential()
    if current is None:
        raise LookupError("no passkey")
    options = generate_authentication_options(
        rp_id=get_settings().rp_id,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(current.credential_id))
        ],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return options_to_json_dict(options), bytes_to_base64url(options.challenge)


def finish_authentication(credential: dict, challenge: str) -> None:
    current = one_credential()
    if current is None:
        raise LookupError("no passkey")
    settings = get_settings()
    verified = verify_authentication_response(
        credential=credential,
        expected_challenge=base64url_to_bytes(challenge),
        expected_rp_id=settings.rp_id,
        expected_origin=settings.origin,
        credential_public_key=base64url_to_bytes(current.public_key),
        credential_current_sign_count=current.sign_count,
        require_user_verification=True,
    )
    with session() as db:
        row = db.get(Credential, current.id)
        row.sign_count = verified.new_sign_count
        db.add(row)
        db.commit()


def enrollment_ok(token: str) -> bool:
    expected = get_settings().enrollment_token
    return bool(expected) and hmac.compare_digest(token.encode(), expected.encode())


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_api_token(name: str) -> tuple[ApiToken, str]:
    token = "site_" + secrets.token_urlsafe(32)
    row = ApiToken(name=name[:60] or "Agent", token_hash=_hash(token))
    with session() as db:
        db.add(row)
        db.commit()
        db.refresh(row)
        db.expunge(row)
    return row, token


def token_matches(token: str) -> bool:
    with session() as db:
        return (
            db.exec(
                select(ApiToken.id).where(ApiToken.token_hash == _hash(token))
            ).first()
            is not None
        )


def signed_in(request: Request) -> bool:
    return request.session.get("user") == OWNER


def require_owner(request: Request) -> None:
    """The signed-in owner. Changes must also come from the site itself (CSRF)."""
    if not signed_in(request):
        raise HTTPException(status_code=401, detail="Sign in first")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        site = request.headers.get("sec-fetch-site")
        if origin != get_settings().origin and not (
            origin is None and site == "same-origin"
        ):
            raise HTTPException(status_code=403, detail="Cross-site request")


def require_owner_or_agent(request: Request) -> str:
    """The owner's session or an agent's bearer token. Returns "owner" or "agent"."""
    header = request.headers.get("authorization", "")
    if header.startswith("Bearer "):
        if token_matches(header.removeprefix("Bearer ").strip()):
            return "agent"
        raise HTTPException(status_code=401, detail="Unknown token")
    require_owner(request)
    return "owner"


Owner = Annotated[None, Depends(require_owner)]
OwnerOrAgent = Annotated[str, Depends(require_owner_or_agent)]
