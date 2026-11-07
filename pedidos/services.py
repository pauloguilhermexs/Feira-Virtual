"""Regras de negócio de carrinho, pedidos e estoque."""
from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from catalogo.models import Produto
from usuarios.models import PerfilProdutor

from .models import HistoricoStatus, ItemPedido, Pedido

S = Pedido.Status

TRANSICOES = {
    S.PENDENTE: {S.ACEITO, S.RECUSADO, S.CANCELADO},
    S.ACEITO: {S.EM_PREPARO, S.CANCELADO},
    S.EM_PREPARO: {S.PRONTO, S.CANCELADO},
    S.PRONTO: {S.EM_ENTREGA, S.CONCLUIDO, S.CANCELADO},
    S.EM_ENTREGA: {S.CONCLUIDO},
}


def validar_pagamento(produtor, forma):
    if forma == Pedido.FormaPagamento.PIX and not produtor.chave_pix:
        raise ValidationError(f"{produtor.nome_propriedade} não aceita Pix.")
    if forma == Pedido.FormaPagamento.CARTAO and not produtor.possui_maquininha:
        raise ValidationError(f"{produtor.nome_propriedade} não possui maquininha de cartão.")
    if forma == Pedido.FormaPagamento.DINHEIRO and not produtor.aceita_dinheiro:
        raise ValidationError(f"{produtor.nome_propriedade} não aceita dinheiro.")


def _registrar(pedido):
    HistoricoStatus.objects.create(pedido=pedido, status=pedido.status)


@transaction.atomic
def finalizar_carrinho(cliente, modalidade, endereco, forma_pagamento, observacao=""):
    """Transforma o carrinho em pedidos (um por produtor)."""
    carrinho = getattr(cliente, "carrinho", None)
    itens = list(carrinho.itens.select_related("produto__produtor")) if carrinho else []
    if not itens:
        raise ValidationError("Não é possível finalizar uma compra sem produtos no carrinho.")
    if modalidade == Pedido.Modalidade.ENTREGA and endereco is None:
        raise ValidationError({"endereco_id": "Informe o endereço de entrega."})

    por_produtor = defaultdict(list)
    for item in itens:
        p = item.produto
        if not p.ativo or p.produtor.status != PerfilProdutor.Status.APROVADO:
            raise ValidationError(f"O produto '{p.nome}' não está mais disponível.")
        if item.quantidade > p.estoque:
            raise ValidationError(f"Estoque insuficiente para '{p.nome}' (disponível: {p.estoque}).")
        por_produtor[p.produtor].append(item)

    pedidos = []
    for produtor, its in por_produtor.items():
        validar_pagamento(produtor, forma_pagamento)
        pedido = Pedido.objects.create(
            cliente=cliente, produtor=produtor, modalidade=modalidade, forma_pagamento=forma_pagamento,
            endereco_entrega=endereco.como_texto() if (endereco and modalidade == Pedido.Modalidade.ENTREGA) else "",
            observacao=observacao)
        total = Decimal("0.00")
        for it in its:
            ip = ItemPedido.objects.create(
                pedido=pedido, produto=it.produto, nome_produto=it.produto.nome,
                unidade_medida=it.produto.unidade_medida, preco_unitario=it.produto.preco,
                quantidade=it.quantidade)
            total += ip.subtotal
        pedido.total = total
        pedido.save(update_fields=["total"])
        _registrar(pedido)
        pedidos.append(pedido)
    carrinho.itens.all().delete()
    return pedidos


def _baixar_estoque(pedido):
    for item in pedido.itens.select_related("produto"):
        if item.produto is None:
            raise ValidationError(f"O produto '{item.nome_produto}' foi removido; não é possível aceitar.")
        produto = Produto.objects.select_for_update().get(pk=item.produto_id)
        if item.quantidade > produto.estoque:
            raise ValidationError(f"Estoque insuficiente para '{produto.nome}' (disponível: {produto.estoque}).")
        produto.estoque -= item.quantidade
        produto.save(update_fields=["estoque"])
    pedido.estoque_baixado = True


def _devolver_estoque(pedido):
    for item in pedido.itens.select_related("produto"):
        if item.produto is not None:
            produto = Produto.objects.select_for_update().get(pk=item.produto_id)
            produto.estoque += item.quantidade
            produto.save(update_fields=["estoque"])
    pedido.estoque_baixado = False


@transaction.atomic
def mudar_status(pedido, novo, usuario):
    """Aplica uma transição respeitando quem pode fazê-la e o fluxo permitido."""
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
    novo = S(novo)
    if novo not in TRANSICOES.get(S(pedido.status), set()):
        raise ValidationError(f"Não é possível ir de '{pedido.get_status_display()}' para '{novo.label}'.")

    tipo = usuario.tipo
    if tipo == "CLIENTE":
        if pedido.cliente_id != usuario.id or novo != S.CANCELADO or pedido.status not in (S.PENDENTE, S.ACEITO):
            raise ValidationError("O cliente só pode cancelar pedidos ainda não iniciados.")
    elif tipo == "PRODUTOR":
        if pedido.produtor.usuario_id != usuario.id:
            raise ValidationError("Apenas o produtor responsável pode atualizar este pedido.")
        if novo == S.EM_ENTREGA:
            raise ValidationError("A saída para entrega é registrada pelo entregador.")
        if novo == S.CONCLUIDO and pedido.modalidade != Pedido.Modalidade.RETIRADA:
            raise ValidationError("Pedidos com entrega são concluídos pelo entregador.")
    elif tipo == "ENTREGADOR":
        if pedido.entregador_id != usuario.id or novo not in (S.EM_ENTREGA, S.CONCLUIDO):
            raise ValidationError("Ação não permitida para este entregador.")
    else:
        raise ValidationError("Ação não permitida.")

    if novo == S.ACEITO:
        _baixar_estoque(pedido)
    elif novo in (S.CANCELADO, S.RECUSADO) and pedido.estoque_baixado:
        _devolver_estoque(pedido)

    pedido.status = novo
    pedido.save()
    _registrar(pedido)
    return pedido
