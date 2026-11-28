from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from config.validators import validar_imagem_upload
from usuarios.models import PerfilProdutor

from .models import Categoria, Produto


class ProdutorPublicoSerializer(serializers.ModelSerializer):
    """Vitrine pública de produtores: não expõe dados sensíveis como chave Pix ou telefones."""
    total_produtos = serializers.IntegerField(read_only=True, default=0)
    cidade_uf = serializers.SerializerMethodField()
    aceita_pix = serializers.SerializerMethodField()
    nota_media = serializers.FloatField(read_only=True, default=None)
    total_avaliacoes = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = PerfilProdutor
        fields = [
            "id",
            "nome_propriedade",
            "descricao",
            "cidade",
            "estado",
            "cidade_uf",
            "foto_propriedade",
            "aceita_pix",
            "possui_maquininha",
            "aceita_dinheiro",
            "total_produtos",
            "nota_media",
            "total_avaliacoes",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_cidade_uf(self, obj):
        partes = [p for p in (obj.cidade, obj.estado) if p]
        return " / ".join(partes) if partes else ""

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_aceita_pix(self, obj) -> bool:
        return bool((obj.chave_pix or "").strip())


class EstatisticasPublicasSerializer(serializers.Serializer):
    familias_atendidas_semana = serializers.IntegerField()
    total_clientes = serializers.IntegerField()
    total_produtores = serializers.IntegerField()
    total_produtos = serializers.IntegerField()
    total_pedidos_concluidos = serializers.IntegerField()


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ["id", "nome", "descricao", "ativa"]


class ProdutoPublicoSerializer(serializers.ModelSerializer):
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True)
    categoria_nome = serializers.CharField(source="categoria.nome", read_only=True)
    nota_media = serializers.FloatField(read_only=True, default=None)
    total_avaliacoes = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Produto
        fields = ["id", "nome", "descricao", "preco", "unidade_medida", "estoque", "tipo_producao", "imagem",
                  "categoria", "categoria_nome", "produtor", "produtor_nome", "nota_media", "total_avaliacoes"]


class ProdutoProdutorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Produto
        fields = ["id", "nome", "descricao", "preco", "unidade_medida", "estoque", "tipo_producao", "imagem",
                  "categoria", "ativo", "oculto_moderacao", "criado_em"]
        read_only_fields = ["criado_em", "oculto_moderacao"]

    def validate_categoria(self, value):
        if not value.ativa:
            raise serializers.ValidationError("Categoria inativa.")
        return value

    def validate_imagem(self, value):
        if value is not None:
            validar_imagem_upload(value)
        return value
