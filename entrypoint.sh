#!/bin/sh
set -e

echo "Aguardando banco de dados..."
python - << 'EOF'
import os, sys, time
import pymysql

pymysql.version_info = (2, 2, 1, "final", 0)
pymysql.install_as_MySQLdb()

host = os.environ.get("DB_HOST", "127.0.0.1")
port = int(os.environ.get("DB_PORT", "3306"))
user = os.environ.get("DB_USER", "root")
password = os.environ.get("DB_PASSWORD", "")
name = os.environ.get("DB_NAME", "feira_virtual")
engine = os.environ.get("DB_ENGINE", "mysql").lower()

if engine != "sqlite":
    for _ in range(30):
        try:
            conn = pymysql.connect(host=host, port=port, user=user, password=password, database=name, connect_timeout=3)
            conn.close()
            print("Banco de dados pronto!")
            sys.exit(0)
        except Exception:
            time.sleep(1)
    print("Aviso: Não foi possível conectar ao banco antes de iniciar.")
EOF

echo "Aplicando migrações..."
python manage.py migrate --noinput

exec "$@"

