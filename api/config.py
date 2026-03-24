from pathlib import Path

from dotenv import load_dotenv
from pydantic.v1 import BaseSettings, Field, ValidationError, validator

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=ROOT_DIR / ".env", override=False)


class Settings(BaseSettings):
    GROQ_API_KEY_HEAVY: str = Field(..., min_length=1)
    GROQ_API_KEY_LIGHT: str = Field(..., min_length=1)
    GOOGLE_API_KEY: str = Field(..., min_length=1)
    SUPABASE_URL: str = Field(..., min_length=1)
    SUPABASE_ANON_KEY: str = Field(..., min_length=1)
    FRONTEND_URL: str = Field(default="https://narrativeops.vercel.app")
    TAVILY_API_KEY: str | None = None

    @validator(
        "GROQ_API_KEY_HEAVY",
        "GROQ_API_KEY_LIGHT",
        "GOOGLE_API_KEY",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
    )
    def validate_not_blank(cls, value: str, field):
        if not value or not value.strip():
            raise ValueError(f"{field.name} cannot be blank")
        return value

    class Config:
        case_sensitive = True


def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        missing_keys: list[str] = []
        invalid_keys: list[str] = []

        for error in exc.errors():
            location = error.get("loc", ())
            key = str(location[0]) if location else "<unknown>"
            if error.get("type") == "value_error.missing":
                missing_keys.append(key)
            else:
                invalid_keys.append(key)

        message_parts: list[str] = []
        if missing_keys:
            message_parts.append(
                "Missing required environment variables: "
                + ", ".join(sorted(set(missing_keys)))
            )
        if invalid_keys:
            message_parts.append(
                "Invalid environment variable values: "
                + ", ".join(sorted(set(invalid_keys)))
            )

        message_parts.append(
            "Set these in .env (see .env.example) or in your process environment before startup."
        )
        raise ValueError(". ".join(message_parts)) from exc


settings = get_settings()
