import os
import re
from pathlib import Path
import pytest
from playwright.sync_api import sync_playwright
from usuarios.models import Usuario, PerfilProdutor, PerfilEntregador, Endereco
from catalogo.models import Categoria, Produto

PW="Teste-E2E-12345"

@pytest.fixture
def dados(transactional_db):
    users={}
    for name,tipo in [("cliente","CLIENTE"),("produtor","PRODUTOR"),("entregador","ENTREGADOR"),("admin","ADMIN")]:
        users[name]=Usuario.objects.create_user(name,email=f"{name}@example.test",password=PW,tipo=tipo)
    perfil=PerfilProdutor.objects.create(usuario=users["produtor"],nome_propriedade="Sítio Teste",status="APROVADO",chave_pix="simulado@example.test")
    PerfilEntregador.objects.create(usuario=users["entregador"],veiculo="Bicicleta")
    Endereco.objects.create(usuario=users["cliente"],logradouro="Rua Teste",numero="1",bairro="Centro",cidade="Natal",estado="RN")
    categoria=Categoria.objects.create(nome="Frutas")
    produto=Produto.objects.create(produtor=perfil,categoria=categoria,nome="Banana de Teste",preco="4.50",estoque=10,unidade_medida="UNIDADE")
    return users,perfil,produto

@pytest.fixture
def navegador(request,live_server,dados):
    with sync_playwright() as p:
        executable=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        browser=p.chromium.launch(headless=True,**({"executable_path":executable} if executable else {}))
        context=browser.new_context(viewport={"width":1440,"height":900})
        context.tracing.start(screenshots=True,snapshots=True,sources=True)
        page=context.new_page()
        page.set_default_timeout(10000)
        page.on("dialog",lambda d:d.accept())
        page.goto(live_server.url)
        yield page
        out=Path("reports/testes/e2e"); out.mkdir(parents=True,exist_ok=True)
        name=re.sub(r"[^a-zA-Z0-9_-]","_",request.node.name)
        failed=any(getattr(request.node,"rep_"+phase,None) and getattr(request.node,"rep_"+phase).failed for phase in ("setup","call"))
        if failed:
            page.screenshot(path=str(out/(name+".png")),full_page=True)
            context.tracing.stop(path=str(out/(name+".zip")))
        else: context.tracing.stop()
        browser.close()
