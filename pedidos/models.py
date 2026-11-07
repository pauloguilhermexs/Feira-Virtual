from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Carrinho(models.Model):
    cliente = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="carrinho")

    @property
    def total(self):
        return sum((i.subtotal for i in self.itens.all()), Decimal("0.00"))


class ItemCarrinho(models.Model):
    carrinho = models.ForeignKey(Carrinho, on_delete=models.CASCADE, related_name="itens")
    produto = models.ForeignKey("catalogo.Produto", on_delete=models.CASCADE)
    quantidade = models.DecimalField(max_digits=10, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])

    class Meta:
        constraints = [models.UniqueConstraint(fields=["carrinho", "produto"], name="item_unico_por_carrinho")]

    @property
    def subtotal(self):
        return (self.produto.preco * self.quantidade).quantize(Decimal("0.01"))


class Pedido(models.Model):
    class Status(models.TextChoices):
        PENDENTE = "PENDENTE", "Aguardando produtor"
        ACEITO = "ACEITO", "Aceito"
        RECUSADO = "RECUSADO", "Recusado"
        EM_PREPARO = "EM_PREPARO", "Em preparo"
        PRONTO = "PRONTO", "Pronto (entrega/retirada)"
        EM_ENTREGA = "EM_ENTREGA", "Saiu para entrega"
        CONCLUIDO = "CONCLUIDO", "Concluído"
        CANCELADO = "CANCELADO", "Cancelado"

    class Modalidade(models.TextChoices):
        ENTREGA = "ENTREGA", "Entrega"
        RETIRADA = "RETIRADA", "Retirada com o produtor"

    class FormaPagamento(models.TextChoices):
        PIX = "PIX", "Pix"
        CARTAO = "CARTAO", "Cartão (maquininha)"
        DINHEIRO = "DINHEIRO", "Dinheiro"

    cliente = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="pedidos")
    produtor = models.ForeignKey("usuarios.PerfilProdutor", on_delete=models.PROTECT, related_name="pedidos")
    entregador = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="entregas")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDENTE)
    modalidade = models.CharField(max_length=10, choices=Modalidade.choices)
    forma_pagamento = models.CharField(max_length=10, choices=FormaPagamento.choices)
    endereco_entrega = models.TextField(blank=True, help_text="Cópia do endereço no momento da compra")
    observacao = models.CharField(max_length=255, blank=True)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    estoque_baixado = models.BooleanField(default=False)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-criado_em"]


class ItemPedido(models.Model):
    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name="itens")
    produto = models.ForeignKey("catalogo.Produto", null=True, on_delete=models.SET_NULL, related_name="itens_pedido")
    # Cópia dos dados no momento da compra (o produto pode mudar de preço ou ser excluído depois)
    nome_produto = models.CharField(max_length=150)
    unidade_medida = models.CharField(max_length=10)
    preco_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    quantidade = models.DecimalField(max_digits=10, decimal_places=3)

    @property
    def subtotal(self):
        return (self.preco_unitario * self.quantidade).quantize(Decimal("0.01"))


class HistoricoStatus(models.Model):
    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name="historico")
    status = models.CharField(max_length=12, choices=Pedido.Status.choices)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["criado_em", "id"]
