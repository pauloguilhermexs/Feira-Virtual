"""Executa pytest e preserva o exit code mesmo ao gerar artefatos de falhas."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import shutil
from datetime import datetime
from zoneinfo import ZoneInfo

p=argparse.ArgumentParser(); p.add_argument("tipo",choices=["unit","integration","system","all"]); args=p.parse_args()
root=Path(__file__).resolve().parents[1]; os.chdir(root)
out=root/"reports/testes"; out.mkdir(parents=True,exist_ok=True)
# Evita apresentar resultados ou imagens antigos em uma nova execução interrompida.
for name in ("junit.xml","cobertura.json","resultados.json","index.html","visao-geral.png","falhas.png"):
    (out/name).unlink(missing_ok=True)
if (out/"e2e").exists(): shutil.rmtree(out/"e2e")
cmd=[sys.executable,"-m","coverage","run","-m","pytest","--junitxml=reports/testes/junit.xml"]
if args.tipo!="all": cmd += ["-m",args.tipo]
start=datetime.now(ZoneInfo("America/Fortaleza")).isoformat()
result=subprocess.run(cmd)
(out/"execucao.json").write_text(json.dumps({"inicio":start,"exit_code":result.returncode,"selecao":args.tipo}))
for command in (["coverage","json","-o",str(out/"cobertura.json")],["coverage","html","-d",str(out/"coverage")]):
    subprocess.run([sys.executable,"-m",*command],check=True)
report=subprocess.run([sys.executable,"scripts/gerar_relatorio_testes.py"])
sys.exit(result.returncode or report.returncode)
