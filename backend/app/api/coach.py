from __future__ import annotations

import json

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload

from app.coach.client import coach_available, stream_coach_reply
from app.coach.context import player_context
from app.config import Settings, app_settings
from app.db import SessionLocal, get_db
from app.models import CoachConversation, CoachMessage
from app.observability import track
from app.schemas import CoachChatRequest

router = APIRouter(prefix="/coach", tags=["coach"])
MAX_HISTORY = 20


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/status")
def status(settings: Settings = Depends(app_settings)) -> dict:
    return {"available": coach_available(settings), "model": settings.claude_model}


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int, db: Session = Depends(get_db)) -> dict:
    conv = db.get(CoachConversation, conversation_id, options=[selectinload(CoachConversation.messages)])
    if not conv:
        raise HTTPException(404, "Conversation introuvable")
    return {
        "id": conv.id, "title": conv.title, "match_id": conv.match_id,
        "messages": [{"role": m.role, "content": m.content} for m in conv.messages],
    }


@router.post("/chat")
async def chat(
    body: CoachChatRequest, db: Session = Depends(get_db), settings: Settings = Depends(app_settings)
) -> StreamingResponse:
    if body.conversation_id:
        conv = db.get(CoachConversation, body.conversation_id, options=[selectinload(CoachConversation.messages)])
        if not conv:
            raise HTTPException(404, "Conversation introuvable")
    else:
        conv = CoachConversation(title=body.message[:120], match_id=body.match_id)
        db.add(conv)
        db.flush()
    db.add(CoachMessage(conversation_id=conv.id, role="user", content=body.message))
    db.commit()
    db.refresh(conv)

    history = [{"role": m.role, "content": m.content} for m in conv.messages][-MAX_HISTORY:]
    context = player_context(db, conv.match_id)
    conversation_id = conv.id
    track("coach_message", {"with_match": conv.match_id is not None})

    async def events():
        yield _sse("start", {"conversation_id": conversation_id})
        parts: list[str] = []
        if not coach_available(settings):
            text = ("Le coach IA n'est pas encore configuré : ajoutez votre clé `ANTHROPIC_API_KEY` dans "
                    "les paramètres. En attendant, consultez le rapport de partie et votre HEROS SCORE.")
            parts.append(text)
            yield _sse("delta", {"text": text})
        else:
            try:
                async for chunk in stream_coach_reply(settings, context, history):
                    parts.append(chunk)
                    yield _sse("delta", {"text": chunk})
            except anthropic.RateLimitError:
                yield _sse("error", {"message": "Limite de requêtes atteinte, réessayez dans un instant."})
            except anthropic.APIStatusError as exc:
                yield _sse("error", {"message": f"Erreur de l'API Claude ({exc.status_code})."})
            except anthropic.APIConnectionError:
                yield _sse("error", {"message": "Impossible de joindre l'API Claude."})
        if parts:
            with SessionLocal() as s:
                s.add(CoachMessage(conversation_id=conversation_id, role="assistant", content="".join(parts)))
                s.commit()
        yield _sse("done", {"conversation_id": conversation_id})

    return StreamingResponse(events(), media_type="text/event-stream")
