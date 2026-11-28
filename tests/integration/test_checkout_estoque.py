from decimal import Decimal
from unittest.mock import patch
import hashlib
import hmac
import json
import pytest
from rest_framework.test import APIClient
from catalogo.models import Categoria, Produto
from usuarios.models import Usuario, PerfilProdutor
from pedidos.models import Pedido, ItemPedido

@pytest.fixture
def compra(db):
    cliente=Usuario.objects.create_user("cliente",email="cliente@example.test")
    produtor=Usuario.objects.create_user("produtor",email="produtor@example.test",tipo="PRODUTOR")
    perfil=PerfilProdutor.objects.create(usuario=produtor,nome_propriedade="Sítio",status="APROVADO",chave_pix="teste@example.test")
    cat=Categoria.objects.create(nome="Frutas")
    produtos=[Produto.objects.create(produtor=perfil,categoria=cat,nome=f"Produto {i}",preco="4.50",estoque=10) for i in range(2)]
    api=APIClient(); api.force_authenticate(cliente)
    for p in produtos:
        assert api.post("/api/carrinho/itens/",{"produto":p.pk,"quantidade":"2"}).status_code==201
    response=api.post("/api/pedidos/",{"modalidade":"RETIRADA","forma_pagamento":"PIX"})
    assert response.status_code==201
    return api,cliente,produtor,produtos,Pedido.objects.get(pk=response.data[0]["id"])

@pytest.mark.django_db
def test_aceite_atomico(compra):
    """Segundo item sem estoque: aceite retorna 400 e rollback preserva primeiro item, status e histórico."""
    api,_,produtor,produtos,pedido=compra
    produtos[1].estoque=1; produtos[1].save()
    api.force_authenticate(produtor)
    r=api.post(f"/api/produtor/pedidos/{pedido.pk}/aceitar/")
    assert r.status_code==400
    for p,expected in zip(produtos,[Decimal(10),Decimal(1)]):
        p.refresh_from_db(); assert p.estoque==expected
    pedido.refresh_from_db()
    assert pedido.status=="PENDENTE" and not pedido.estoque_baixado
    assert pedido.historico.count()==1

@pytest.mark.django_db
def test_cancelamento_repetido(compra):
    """Aceitar e cancelar devolve estoque uma vez; repetição rejeitada não duplica saldo."""
    api,cliente,produtor,produtos,pedido=compra
    api.force_authenticate(produtor)
    assert api.post(f"/api/produtor/pedidos/{pedido.pk}/aceitar/").status_code==200
    api.force_authenticate(cliente)
    assert api.post(f"/api/pedidos/{pedido.pk}/cancelar/").status_code==200
    assert api.post(f"/api/pedidos/{pedido.pk}/cancelar/").status_code==400
    for p in produtos: p.refresh_from_db(); assert p.estoque==Decimal(10)
    pedido.refresh_from_db(); assert not pedido.estoque_baixado
    assert pedido.historico.count()==3

@pytest.mark.django_db
def test_pix_idempotente(compra,settings):
    """Webhook Pix assinado repetido mantém uma baixa e um único histórico de aceite."""
    api,_,_,produtos,pedido=compra
    settings.PIX_WEBHOOK_SECRET="teste-local"
    r=api.get(f"/api/pedidos/{pedido.pk}/pix/")
    assert r.status_code==200 and r.data["simulado"] is True
    payload=json.dumps({"txid":r.data["txid"],"evento":"PAGAMENTO_CONFIRMADO"}).encode()
    sig=hmac.new(b"teste-local",payload,hashlib.sha256).hexdigest()
    api.force_authenticate(None)
    for _ in range(2):
        assert api.post("/api/pedidos/pix/webhook/",payload,content_type="application/json",HTTP_X_SIGNATURE=sig).status_code==200
    pedido.refresh_from_db(); assert pedido.status=="ACEITO"
    assert pedido.historico.filter(status="ACEITO").count()==1
    for p in produtos: p.refresh_from_db(); assert p.estoque==Decimal(8)

@pytest.mark.django_db
def test_snapshot_preco(compra):
    """Alteração do produto após checkout não altera preço, nome ou total do pedido."""
    _,_,_,produtos,pedido=compra
    produtos[0].preco=99; produtos[0].nome="Alterado"; produtos[0].save()
    item=pedido.itens.get(produto=produtos[0]); pedido.refresh_from_db()
    assert item.preco_unitario==Decimal("4.50") and item.nome_produto=="Produto 0"
    assert pedido.total==Decimal("18.00")

@pytest.mark.django_db
def test_checkout_rollback_notificacao(compra):
    """Falha de dependência durante transição faz rollback de estoque, status e histórico."""
    from pedidos.services import mudar_status
    _,_,produtor,produtos,pedido=compra
    with patch("pedidos.services.notificador.disparar",side_effect=RuntimeError("falha simulada")):
        with pytest.raises(RuntimeError): mudar_status(pedido,"ACEITO",produtor)
    pedido.refresh_from_db(); assert pedido.status=="PENDENTE"
    assert pedido.historico.count()==1
    for p in produtos: p.refresh_from_db(); assert p.estoque==Decimal(10)

@pytest.mark.django_db
def test_multiplos_produtores_totais_e_rollback(compra):
    """Dois produtores: falha de pagamento não cria pedido parcial; sucesso separa titulares e totais."""
    from pedidos.models import Carrinho
    api,cliente,produtor,produtos,_=compra
    outro=Usuario.objects.create_user("outro",email="outro@example.test",tipo="PRODUTOR")
    perfil=PerfilProdutor.objects.create(usuario=outro,nome_propriedade="Outro sítio",status="APROVADO",aceita_dinheiro=False)
    p=Produto.objects.create(produtor=perfil,categoria=produtos[0].categoria,nome="Outro produto",preco="6",estoque=10)
    for produto,qtd in [(produtos[0],2),(p,3)]:
        assert api.post("/api/carrinho/itens/",{"produto":produto.pk,"quantidade":qtd}).status_code==201
    antes=Pedido.objects.count()
    assert api.post("/api/pedidos/",{"modalidade":"RETIRADA","forma_pagamento":"DINHEIRO"}).status_code==400
    assert Pedido.objects.count()==antes
    assert Carrinho.objects.get(cliente=cliente).itens.count()==2
    perfil.aceita_dinheiro=True; perfil.save()
    res=api.post("/api/pedidos/",{"modalidade":"RETIRADA","forma_pagamento":"DINHEIRO"})
    assert res.status_code==201
    assert {x["produtor"]:Decimal(x["total"]) for x in res.data}=={produtor.perfil_produtor.pk:Decimal("9.00"),perfil.pk:Decimal("18.00")}
    assert Carrinho.objects.get(cliente=cliente).itens.count()==0
    for row in res.data:
        pedido=Pedido.objects.get(pk=row["id"])
        assert all(it.produto.produtor_id==pedido.produtor_id for it in pedido.itens.all())

@pytest.mark.parametrize("novo", ["EM_PREPARO","PRONTO","CONCLUIDO","EM_ENTREGA"])
@pytest.mark.django_db
def test_transicao_pula_etapa(compra,novo):
    """Produtor tenta saltar de PENDENTE para etapa posterior: 400 sem alteração persistida."""
    api,_,produtor,produtos,pedido=compra
    api.force_authenticate(produtor)
    assert api.post(f"/api/produtor/pedidos/{pedido.pk}/status/",{"status":novo}).status_code==400
    pedido.refresh_from_db(); assert pedido.status=="PENDENTE" and pedido.historico.count()==1
    for p in produtos: p.refresh_from_db(); assert p.estoque==Decimal(10)
