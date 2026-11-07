from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class Avaliacao(models.Model):
    cliente = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="avaliacoes")
    produto = models.ForeignKey("catalogo.Produto", null=True, blank=True, on_delete=models.CASCADE,
                                related_name="avaliacoes")
    produtor = models.ForeignKey("usuarios.PerfilProdutor", null=True, blank=True, on_delete=models.CASCADE,
                                 related_name="avaliacoes")
    nota = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comentario = models.TextField(blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criado_em"]
        constraints = [
            models.UniqueConstraint(fields=["cliente", "produto"], condition=Q(produto__isnull=False),
                                    name="uma_avaliacao_por_cliente_produto"),
            models.UniqueConstraint(fields=["cliente", "produtor"], condition=Q(produtor__isnull=False),
                                    name="uma_avaliacao_por_cliente_produtor"),
            models.CheckConstraint(
                condition=(Q(produto__isnull=False, produtor__isnull=True) |
                           Q(produto__isnull=True, produtor__isnull=False)),
                name="avaliacao_produto_ou_produtor"),
        ]


class Reclamacao(models.Model):
    class Status(models.TextChoices):
        ABERTA = "ABERTA", "Aberta"
        EM_ANALISE = "EM_ANALISE", "Em análise"
        RESOLVIDA = "RESOLVIDA", "Resolvida"

    cliente = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reclamacoes")
    pedido = models.ForeignKey("pedidos.Pedido", on_delete=models.CASCADE, related_name="reclamacoes")
    assunto = models.CharField(max_length=150)
    descricao = models.TextField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ABERTA)
    resposta_admin = models.TextField(blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criado_em"]
