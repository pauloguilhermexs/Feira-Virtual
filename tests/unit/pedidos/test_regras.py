from decimal import Decimal
from types import SimpleNamespace
import hashlib
import hmac
import pytest
from rest_framework.exceptions import ValidationError
from pedidos.models import Pedido, ItemPedido
from pedidos.services import validar_pagamento
from pedidos.serializers import _resumir_endereco_entregador
from pedidos.pix import MockPixGateway, DEFAULT_DEV_SECRET

@pytest.mark.parametrize("forma,field", [("PIX","chave_pix"),("CARTAO","possui_maquininha"),("DINHEIRO","aceita_dinheiro")])
@pytest.mark.parametrize("aceita", [True,False])
def test_pagamento(forma,field,aceita):
    """Forma habilitada é aceita; desabilitada é recusada sem comunicação externa."""
    p=SimpleNamespace(nome_propriedade="Sítio",chave_pix="",possui_maquininha=False,aceita_dinheiro=False)
    setattr(p,field,aceita)
    if aceita: assert validar_pagamento(p,forma) is None
    else:
        with pytest.raises(ValidationError): validar_pagamento(p,forma)

@pytest.mark.parametrize("preco,qtd,expected", [("3.50","2","7.00"),("0.01","0.001","0.00"),("4.99","1.5","7.48")])
def test_subtotal(preco,qtd,expected):
    """Snapshot do item multiplica Decimals e arredonda para centavos."""
    assert ItemPedido(preco_unitario=Decimal(preco),quantidade=Decimal(qtd)).subtotal==Decimal(expected)

@pytest.mark.parametrize("total,frete,expected", [("10.00","7.50","17.50"),(None,None,"0.00"),("0.01","0","0.01")])
def test_total_frete(total,frete,expected):
    """Total com frete soma valores e trata ausência como zero."""
    assert Pedido(total=total,taxa_entrega=frete).total_com_frete==Decimal(expected)

@pytest.mark.parametrize("texto,expected", [("",""),("Rua A, 1 - Centro, Natal/RN 59000-000","Centro, Natal/RN"),("Rua A, 1 - Centro, Natal/RN 59000000","Centro, Natal/RN"),("segredo","Endereço disponível após aceitar a entrega")])
def test_endereco_resumido(texto,expected):
    """Resumo do entregador remove rua e CEP; formato desconhecido não expõe endereço."""
    assert _resumir_endereco_entregador(texto)==expected

@pytest.mark.parametrize("assinatura", ["valida","invalida","ausente","payload_alterado"])
def test_assinatura(settings,assinatura):
    """HMAC só aceita assinatura do conteúdo exato com segredo configurado."""
    settings.PIX_WEBHOOK_SECRET="segredo-teste"; settings.DEBUG=False
    body=b'{"teste":1}'
    sig=hmac.new(b"segredo-teste",body,hashlib.sha256).hexdigest()
    if assinatura=="invalida": sig="0"*64
    if assinatura=="ausente": sig=None
    if assinatura=="payload_alterado": body=b'{"teste":2}'
    assert MockPixGateway().validar_assinatura_webhook(body,sig) is (assinatura=="valida")

@pytest.mark.parametrize("secret", ["",DEFAULT_DEV_SECRET])
def test_segredo_producao(settings,secret):
    """Produção rejeita segredo vazio ou padrão de desenvolvimento."""
    settings.DEBUG=False; settings.PIX_WEBHOOK_SECRET=secret
    assert not MockPixGateway().validar_assinatura_webhook(b"{}","0"*64)
