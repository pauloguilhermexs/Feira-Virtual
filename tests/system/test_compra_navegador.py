from playwright.sync_api import expect
from concurrent.futures import ThreadPoolExecutor


def orm(fn):
    # Playwright mantém event loop ativo; ORM síncrono roda em thread separada.
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(fn).result()

from pedidos.models import Pedido
from avaliacoes.models import Avaliacao
from painel.models import LogAuditoria


def login(page,user):
    page.locator("#btnOpenLogin").click()
    page.locator("#loginUsername").fill(user)
    page.locator("#loginPassword").fill("Teste-E2E-12345")
    page.locator('#loginForm button[type="submit"]').click()
    expect(page.locator("#authModalOverlay")).to_have_attribute("aria-hidden", "true")


def trocar(page,live_server,user):
    page.evaluate("localStorage.clear()")
    page.goto(live_server.url)
    login(page,user)


def test_vitrine_busca_filtro(navegador):
    """Visitante pesquisa produto existente e inexistente e filtra tipo de produção na interface."""
    p=navegador
    expect(p.locator("#productsGrid")).to_contain_text("Banana de Teste")
    p.locator("#searchInput").fill("inexistente")
    expect(p.locator("#productsGrid .product-card")).to_have_count(0)
    p.locator("#searchInput").fill("Banana")
    expect(p.locator("#productsGrid .product-card")).to_have_count(1)
    p.locator("#tipoProducaoSelect").select_option("ORGANICO_CERTIFICADO")
    expect(p.locator("#productsGrid .product-card")).to_have_count(0)


def test_login_invalido(navegador):
    """Credenciais fictícias incorretas mostram mensagem de erro; formulário vazio é inválido."""
    p=navegador
    p.locator("#btnOpenLogin").click()
    assert not p.locator("#loginForm").evaluate("f => f.checkValidity()")
    p.locator("#loginUsername").fill("inexistente")
    p.locator("#loginPassword").fill("senha-incorreta")
    p.locator('#loginForm button[type="submit"]').click()
    expect(p.locator("#loginError")).to_be_visible()


def test_compra_entrega_avaliacao(navegador,live_server,dados):
    """Cliente compra e edita carrinho; produtor prepara; entregador conclui; cliente avalia pela UI."""
    p=navegador
    login(p,"cliente")
    p.locator("#productsGrid .btnAddToCart").click()
    expect(p.locator("#cartDrawer")).to_have_class(__import__("re").compile(".*open.*"))
    p.locator(".btnInc").click()
    expect(p.locator(".qty-val")).to_have_text("2")
    p.locator("#btnCheckout").click()
    p.locator('input[name="modalidade"][value="ENTREGA"]').check()
    p.locator("#enderecoSelect").select_option(index=0)
    p.locator('label.payment-option').filter(has=p.locator('input[value="DINHEIRO"]')).click()
    p.locator("#btnConfirmOrder").click()
    expect(p.locator("#checkoutModalOverlay")).to_have_attribute("aria-hidden", "true")
    pedido=orm(lambda: Pedido.objects.get())
    assert str(pedido.total)=="9.00"
    trocar(p,live_server,"produtor")
    p.locator('[data-producer-tab="pedidos"]').click()
    p.locator('.btnProdOrderAction[data-action="aceitar"]').click()
    p.locator('.btnProdOrderAction[data-next="EM_PREPARO"]').click()
    p.locator('.btnProdOrderAction[data-next="PRONTO"]').click()
    expect(p.locator("#producerOrdersList")).to_contain_text("Pronto")
    trocar(p,live_server,"entregador")
    p.locator('[data-delivery-tab="disponiveis"]').click()
    p.get_by_role("button", name="Aceitar entrega", exact=True).click()
    p.locator('[data-delivery-tab="minhas"]').click()
    p.locator('#deliveryMineList .btnDeliveryAction[data-action="saiu-para-entrega"]').click()
    p.locator('#deliveryMineList .btnDeliveryAction[data-action="confirmar"]').click()
    expect(p.locator('.btnDeliveryAction[data-action="confirmar"]')).to_have_count(0)
    orm(pedido.refresh_from_db); assert pedido.status=="CONCLUIDO"
    trocar(p,live_server,"cliente")
    p.locator('#clientWelcomeBanner [data-action="my-orders"]').first.click()
    p.locator('.btnOpenReview[data-mode="produto"]').click()
    p.locator("#reviewComment").fill("Compra fictícia concluída")
    p.locator("#btnSubmitReview").click()
    expect(p.locator("#reviewModalOverlay")).to_have_attribute("aria-hidden", "true")
    assert orm(lambda: Avaliacao.objects.get(pedido=pedido).nota)==5


def test_admin_moderacao(navegador,live_server,dados):
    """Admin suspende/aprova produtor e oculta produto; visitante vê catálogo atualizado e auditoria persiste."""
    p=navegador
    login(p,"admin")
    p.locator('[data-admin-tab="produtores"]').click()
    p.locator('.btnAdminAction[data-action="suspender"]').click()
    expect(p.locator('.btnAdminAction[data-action="aprovar"]')).to_be_visible()
    orm(dados[1].refresh_from_db); assert dados[1].status=="SUSPENSO"
    context=p.context.browser.new_context()
    visitor=context.new_page(); visitor.goto(live_server.url)
    expect(visitor.locator("#productsGrid .product-card")).to_have_count(0)
    context.close()
    p.locator('.btnAdminAction[data-action="aprovar"]').click()
    expect(p.locator('.btnAdminAction[data-action="suspender"]')).to_be_visible()
    p.locator('[data-admin-tab="produtos"]').click()
    p.locator('.btnAdminAction[data-action="ocultar"]').click()
    expect(p.locator('.btnAdminAction[data-action="reexibir"]')).to_be_visible()
    orm(dados[2].refresh_from_db); assert dados[2].oculto_moderacao
    assert orm(lambda: LogAuditoria.objects.filter(acao="OCULTAR_PRODUTO").exists())
    p.evaluate("localStorage.clear()")
    p.goto(live_server.url)
    expect(p.locator("#productsGrid")).not_to_contain_text("Banana de Teste")


def test_cadastro_cliente(navegador):
    """Visitante cadastra cliente fictício pela UI; conta persistida tem perfil CLIENTE."""
    from usuarios.models import Usuario
    p=navegador
    p.locator("#btnOpenRegister").click()
    for field,value in {"regFirstName":"Teste","regLastName":"Local","regEmail":"novo@example.test","regUsername":"novo_cliente","regPassword":"Teste-E2E-12345"}.items():
        p.locator("#"+field).fill(value)
    p.locator('#registerForm button[type="submit"]').click()
    expect(p.locator("#loginForm")).to_be_visible()
    expect(p.locator("#loginUsername")).to_have_value("novo_cliente")
    assert orm(lambda: Usuario.objects.get(username="novo_cliente").tipo)=="CLIENTE"
