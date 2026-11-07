from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class Categoria(models.Model):
    nome = models.CharField(max_length=80, unique=True)
    descricao = models.CharField(max_length=255, blank=True)
    ativa = models.BooleanField(default=True)

    class Meta:
        ordering = ["nome"]

    def __str__(self):
        return self.nome


class Produto(models.Model):
    class Unidade(models.TextChoices):
        KG = "KG", "kg"
        G = "G", "g"
        L = "L", "L"
        ML = "ML", "ml"
        UNIDADE = "UNIDADE", "unidade"
        CAIXA = "CAIXA", "caixa"
        SACO = "SACO", "saco"
        MACO = "MACO", "maço"

    class TipoProducao(models.TextChoices):
        ORGANICO_CERTIFICADO = "ORGANICO_CERTIFICADO", "Orgânico certificado"
        AGROECOLOGICO = "AGROECOLOGICO", "Agroecológico"
        CONVENCIONAL = "CONVENCIONAL", "Convencional"

    produtor = models.ForeignKey("usuarios.PerfilProdutor", on_delete=models.CASCADE, related_name="produtos")
    categoria = models.ForeignKey(Categoria, on_delete=models.PROTECT, related_name="produtos")
    nome = models.CharField(max_length=150)
    descricao = models.TextField(blank=True)
    preco = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    unidade_medida = models.CharField(max_length=10, choices=Unidade.choices, default=Unidade.UNIDADE)
    estoque = models.DecimalField(max_digits=10, decimal_places=3, validators=[MinValueValidator(Decimal("0"))])
    tipo_producao = models.CharField(max_length=25, choices=TipoProducao.choices, default=TipoProducao.CONVENCIONAL)
    ativo = models.BooleanField(default=True, help_text="Desative para ocultar do catálogo (também usado na moderação).")
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nome"]

    def __str__(self):
        return f"{self.nome} ({self.produtor})"
