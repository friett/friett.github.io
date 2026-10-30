"""The owner's admin API.

Sign-in, stats, content, drafts, the LinkedIn import and agent tokens.

Everything except the sign-in routes needs the owner's session. Agents (for example
Claude with the LinkedIn connector) can add drafts with a bearer token; they cannot
change content directly.
"""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlmodel import select

from app import auth, chat, content, linkedin, suggest, tracking
from app.auth import Owner, OwnerOrAgent
from app.db import ApiToken, one_credential, session

router = APIRouter(prefix="/api/admin", tags=["admin"])

Kind = Literal["profile", "role", "project", "skill", "tool"]


class CredentialIn(BaseModel):
    credential: dict[str, Any]


class SetupIn(BaseModel):
    token: str = ""


class EntryIn(BaseModel):
    kind: Kind
    data: dict[str, Any]


class EntryPatch(BaseModel):
    visible: bool | None = None
    position: int | None = None


class DraftIn(BaseModel):
    kind: Kind
    action: Literal["create", "update", "hide"] = "update"
    data: dict[str, Any]
    reason: str = Field(default="", max_length=500)
    source: str = Field(default="agent", max_length=30)


class ApplyIn(BaseModel):
    data: dict[str, Any] | None = None


class TokenIn(BaseModel):
    name: str = Field(default="Agent", max_length=60)


def _entry(e) -> dict:
    return e.model_dump(mode="json")


@router.get("/state")
def state(request: Request) -> dict:
    return {
        "hasPasskey": one_credential() is not None,
        "signedIn": auth.signed_in(request),
    }


@router.post("/register/options")
def register_options(request: Request, body: SetupIn) -> dict:
    if one_credential() is not None:
        raise HTTPException(status_code=409, detail="A passkey is already registered")
    if not auth.enrollment_ok(body.token):
        raise HTTPException(
            status_code=403, detail="Open the private setup link to register"
        )
    options, challenge = auth.registration_options()
    request.session["register_challenge"] = challenge
    return options


@router.post("/register/verify")
def register_verify(request: Request, body: CredentialIn) -> dict:
    challenge = request.session.pop("register_challenge", None)
    if not challenge:
        raise HTTPException(status_code=400, detail="Start the setup again")
    try:
        auth.finish_registration(body.credential, challenge)
    except PermissionError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001 - any verification failure
        raise HTTPException(
            status_code=400, detail="The passkey could not be verified"
        ) from error
    request.session["user"] = auth.OWNER
    return {"ok": True}


@router.post("/login/options")
def login_options(request: Request) -> dict:
    try:
        options, challenge = auth.authentication_options()
    except LookupError as error:
        raise HTTPException(
            status_code=404, detail="No passkey is registered yet"
        ) from error
    request.session["challenge"] = challenge
    return options


@router.post("/login/verify")
def login_verify(request: Request, body: CredentialIn) -> dict:
    challenge = request.session.pop("challenge", None)
    if not challenge:
        raise HTTPException(status_code=400, detail="Start the sign-in again")
    try:
        auth.finish_authentication(body.credential, challenge)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(
            status_code=401, detail="The passkey could not be verified"
        ) from error
    request.session["user"] = auth.OWNER
    return {"ok": True}


@router.post("/logout")
def logout(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}


@router.get("/stats")
def stats(_: Owner, days: int = 30) -> dict:
    days = max(1, min(days, 365))
    return {"visits": tracking.stats(days), "chat": chat.chat_stats(days)}


@router.get("/entries")
def entries(_: Owner, kind: Kind | None = None) -> list[dict]:
    return [_entry(e) for e in content.list_entries(kind)]


@router.post("/entries")
def create_entry(_: Owner, body: EntryIn) -> dict:
    try:
        return _entry(content.save_entry(body.kind, body.data, source="admin"))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.put("/entries/{entry_id}")
def replace_entry(_: Owner, entry_id: int, body: EntryIn) -> dict:
    try:
        return _entry(
            content.save_entry(body.kind, body.data, source="admin", entry_id=entry_id)
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.patch("/entries/{entry_id}")
def patch_entry(_: Owner, entry_id: int, body: EntryPatch) -> dict:
    try:
        return _entry(
            content.update_entry(entry_id, visible=body.visible, position=body.position)
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/entries/{entry_id}")
def remove_entry(_: Owner, entry_id: int) -> dict:
    try:
        content.delete_entry(entry_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"ok": True}


@router.get("/drafts")
def drafts(
    _: Owner, status: Literal["pending", "applied", "dismissed"] = "pending"
) -> list[dict]:
    return [d.model_dump(mode="json") for d in content.list_drafts(status)]


@router.post("/drafts")
def add_draft(who: OwnerOrAgent, body: DraftIn) -> dict:
    try:
        draft = content.propose(
            body.kind,
            body.data,
            action=body.action,
            reason=body.reason,
            source=body.source if who == "agent" else "admin",
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"draft": draft.model_dump(mode="json") if draft else None}


@router.post("/drafts/{draft_id}/apply")
def apply_draft(_: Owner, draft_id: int, body: ApplyIn) -> dict:
    try:
        return content.decide_draft(draft_id, True, body.data).model_dump(mode="json")
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/drafts/{draft_id}/dismiss")
def dismiss_draft(_: Owner, draft_id: int) -> dict:
    try:
        return content.decide_draft(draft_id, False).model_dump(mode="json")
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/suggest")
async def ai_suggest(_: Owner) -> dict:
    try:
        return await suggest.suggest()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/linkedin")
async def linkedin_import(_: Owner, file: UploadFile) -> dict:
    payload = await file.read(20_000_000)
    try:
        files = linkedin.read_upload(file.filename or "", payload)
    except Exception as error:  # noqa: BLE001 - a broken ZIP
        raise HTTPException(
            status_code=422, detail="This file is not a LinkedIn export"
        ) from error
    if not files:
        raise HTTPException(
            status_code=422,
            detail="No Positions, Skills, Projects or Profile CSV found",
        )
    made = linkedin.drafts_from(files)
    return {"files": sorted(files), "drafts": [d.model_dump(mode="json") for d in made]}


@router.get("/tokens")
def tokens(_: Owner) -> list[dict]:
    with session() as db:
        rows = db.exec(select(ApiToken).order_by(ApiToken.id)).all()
        return [
            {"id": r.id, "name": r.name, "createdAt": r.created_at.isoformat()}
            for r in rows
        ]


@router.post("/tokens")
def create_token(_: Owner, body: TokenIn) -> dict:
    row, token = auth.new_api_token(body.name)
    return {"id": row.id, "name": row.name, "token": token}


@router.delete("/tokens/{token_id}")
def delete_token(_: Owner, token_id: int) -> dict:
    with session() as db:
        row = db.get(ApiToken, token_id)
        if row is None:
            raise HTTPException(status_code=404, detail="No such token")
        db.delete(row)
        db.commit()
    return {"ok": True}
