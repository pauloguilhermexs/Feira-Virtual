"""Configuração exclusivamente de testes; nunca aponta para banco de produção."""
import os
os.environ["DB_ENGINE"] = "sqlite"
os.environ["DJANGO_DEBUG"] = "1"
os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key-isolated-feira-virtual-1234567890")
from .settings import *  # noqa: F403
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
DEBUG = True
SECURE_SSL_REDIRECT = False
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
STORAGES = {"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
            "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}}
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {  # noqa: F405
    k: "10000/minute" for k in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]}}  # noqa: F405
