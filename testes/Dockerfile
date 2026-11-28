FROM python:3.12-slim

# Evita criação de arquivos .pyc, envia logs direto ao stdout e define HOME gravável (evita erro do control server do Gunicorn)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/home/appuser

WORKDIR /app

# Cria usuário sem privilégios administrativos com diretório HOME gravável
RUN addgroup --system appgroup \
    && adduser --system --home /home/appuser --ingroup appgroup appuser \
    && mkdir -p /home/appuser /app/staticfiles /app/media \
    && chown -R appuser:appgroup /home/appuser /app

# Instala dependências do Python (PyMySQL é 100% Python puro — sem gcc/libmysqlclient)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código já pertencendo ao usuário não-root (evita duplicação de camadas por chown -R)
COPY --chown=appuser:appgroup . .
RUN chmod +x /app/entrypoint.sh

USER appuser

# Coleta arquivos estáticos usando WhiteNoise (com SQLite temporário durante o build)
RUN DB_ENGINE=sqlite python manage.py collectstatic --no-input

EXPOSE 8000

# Healthcheck do container no endpoint dedicado da API (usa Python stdlib, dispensando curl)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health/')" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
