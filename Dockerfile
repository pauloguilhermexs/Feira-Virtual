FROM python:3.12-slim

# Evita criação de arquivos .pyc e faz o stdout/stderr sair direto no console
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Instala dependências do sistema necessárias para build básico
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Cria usuário sem privilégios administrativos para segurança
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Instala dependências do Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação
COPY . .

# Ajusta permissões e diretórios para arquivos estáticos e de mídia
RUN mkdir -p /app/staticfiles /app/media \
    && chown -R appuser:appgroup /app \
    && chmod +x /app/entrypoint.sh

USER appuser

# Coleta arquivos estáticos usando whitenoise (com SQLite temporário)
RUN DB_ENGINE=sqlite python manage.py collectstatic --no-input

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]

