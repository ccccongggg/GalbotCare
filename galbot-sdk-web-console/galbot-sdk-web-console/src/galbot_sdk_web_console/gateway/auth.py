"""Lightweight per-process access-code authentication for the robot console."""

import os
import secrets
from dataclasses import dataclass, field


ACCESS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
SESSION_COOKIE = "galbot_console_session"


@dataclass
class AuthManager:
    """Keep the access code and sessions in memory for one service process."""

    code_length: int = 8
    access_code: str = field(init=False)
    sessions: set[str] = field(default_factory=set, init=False)

    def __post_init__(self) -> None:
        env_code = self.normalize_code(os.environ.get("GALBOT_ACCESS_CODE", ""))
        if len(env_code) >= 4:
            # Fixed code for deployments (set GALBOT_ACCESS_CODE); otherwise random.
            self.access_code = env_code
        else:
            self.access_code = "".join(secrets.choice(ACCESS_ALPHABET) for _ in range(self.code_length))

    @staticmethod
    def normalize_code(value: str) -> str:
        return "".join(str(value).upper().split()).replace("-", "")

    def verify_code(self, value: str) -> bool:
        candidate = self.normalize_code(value)
        return len(candidate) == len(self.access_code) and secrets.compare_digest(candidate, self.access_code)

    def create_session(self) -> str:
        session_id = secrets.token_urlsafe(18)
        self.sessions.add(session_id)
        return session_id

    def is_authenticated(self, session_id: str | None) -> bool:
        return bool(session_id) and session_id in self.sessions

    def revoke(self, session_id: str | None) -> None:
        if session_id:
            self.sessions.discard(session_id)
