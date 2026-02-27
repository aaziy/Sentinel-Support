from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "change-me"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # Rate limiting (per IP)
    RATE_LIMIT: str = "60/minute"

    # LLM provider: "groq" (default, free) or "openai"
    LLM_PROVIDER: str = "groq"

    # Groq (free tier — 14,400 req/day, ~500 tok/s)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # OpenAI (fallback)
    OPENAI_API_KEY: str = ""

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Database (Supabase Postgres connection string)
    DATABASE_URL: str

    # Email (Resend)
    RESEND_API_KEY: str = ""
    SUPPORT_FROM_EMAIL: str = "support@sentinel-ai.support"
    SUPPORT_BRAND_NAME: str = "Sentinel Support"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
