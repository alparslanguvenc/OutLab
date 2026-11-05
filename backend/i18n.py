"""Per-request language for user-facing messages (Turkish default, English optional).

Messages are written inline as pairs so each translation stays next to its
context: msg("Dosya boş.", "The file is empty."). The language is held in a
ContextVar, so concurrent requests never see each other's choice.
"""
from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Literal

Lang = Literal["tr", "en"]
HEADER = "x-outlab-lang"
DEFAULT: Lang = "tr"

_lang: ContextVar[Lang] = ContextVar("outlab_lang", default=DEFAULT)


def parse_lang(value: str | None) -> Lang:
    """Map a header value to a supported language; anything else is Turkish."""
    return "en" if (value or "").strip().lower() == "en" else DEFAULT


def set_lang(lang: str | None) -> Token[Lang]:
    """Set the language for the current context; returns a token for reset_lang."""
    return _lang.set(parse_lang(lang))


def reset_lang(token: Token[Lang]) -> None:
    _lang.reset(token)


def get_lang() -> Lang:
    return _lang.get()


def msg(tr: str, en: str) -> str:
    """Return the string for the current request language."""
    return en if _lang.get() == "en" else tr
