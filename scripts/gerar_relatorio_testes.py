"""Converte JUnit XML + coverage JSON reais em painel independente de servidor."""
import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET
from collections import Counter

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"reports/testes"

def resumo(tests):
    c=Counter(t["status"] for t in tests)
    return {"total":len(tests),**{k:c[k] for k in ("aprovado","falha","erro","ignorado")},"duracao":sum(t["duracao"] for t in tests)}

def main():
    meta=json.loads((OUT/"metadados.json").read_text()) if (OUT/"metadados.json").exists() else {}
    execution=json.loads((OUT/"execucao.json").read_text()) if (OUT/"execucao.json").exists() else {}
    cases=[]; xml=ET.parse(OUT/"junit.xml").getroot() if (OUT/"junit.xml").exists() else None
    for tc in ([] if xml is None else xml.iter("testcase")):
        props={v.get("name"):v.get("value") for v in tc.findall("properties/property")}
        node=props.get("nodeid",tc.get("classname","")+"::"+tc.get("name",""))
        m=meta.get(node,{})
        if not m:
            m=next((v for k,v in meta.items() if v["metodo"]==tc.get("name") and v["arquivo"].replace("/",".").removesuffix(".py") in tc.get("classname","")),{})
        status="aprovado"; detail="Asserções concluídas sem falha."
        for tag,label in [("skipped","ignorado"),("failure","falha"),("error","erro")]:
            child=tc.find(tag)
            if child is not None: status=label; detail=(child.get("message","")+"\n"+(child.text or "")).strip()
        cases.append({**m,"id":node,"nome":tc.get("name"),"tipo":m.get("tipo","indisponivel"),"modulo":m.get("modulo","coleta"),"classe":m.get("classe",tc.get("classname","")),"status":status,"duracao":float(tc.get("time","0")),"observado":detail})
    cov=json.loads((OUT/"cobertura.json").read_text()) if (OUT/"cobertura.json").exists() else {}
    totals=resumo(cases)
    data={"execucao":execution,"resumo":totals,"duracao_total":sum(float(s.get("time",0)) for s in ([] if xml is None else xml.iter("testsuite"))),"grupos":{g:resumo([t for t in cases if t["tipo"]==g]) for g in ("unit","integration","system")},"modulos":{m:resumo([t for t in cases if t["modulo"]==m]) for m in sorted({t["modulo"] for t in cases})},"testes":cases,"cobertura":cov}
    (OUT/"resultados.json").write_text(json.dumps(data,ensure_ascii=False,indent=2))
    template=(ROOT/"scripts/relatorio.html").read_text()
    encoded=json.dumps(data,ensure_ascii=False).replace("<",r"\u003c")
    (OUT/"index.html").write_text(template.replace("__DADOS__",encoded))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        executable=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        browser=p.chromium.launch(headless=True,**({"executable_path":executable} if executable else {}))
        page=browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=1)
        page.goto((OUT/"index.html").as_uri())
        page.locator("#tree details").first.wait_for() if cases else None
        page.screenshot(path=str(OUT/"visao-geral.png"))
        if totals["falha"] or totals["erro"]:
            page.locator("#status").select_option("problema")
            page.evaluate("document.querySelectorAll('#tree details').forEach(d=>d.open=true)")
            page.screenshot(path=str(OUT/"falhas.png"),full_page=True)
        # Verifica filtros e abertura offline com os dados da execução.
        page.locator("#search").fill("__nenhum_teste_com_este_nome__")
        assert page.locator("#tree .case").count()==0
        page.locator("#search").fill("")
        browser.close()
    print(json.dumps({"resumo":totals,"grupos":data["grupos"]},ensure_ascii=False))

if __name__=="__main__": main()
