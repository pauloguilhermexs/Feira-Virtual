from rest_framework import serializers

from .models import Categoria, Produto


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ["id", "nome", "descricao", "ativa"]


class ProdutoPublicoSerializer(serializers.ModelSerializer):
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True)
    categoria_nome = serializers.CharField(source="categoria.nome", read_only=True)
    nota_media = serializers.FloatField(read_only=True, default=None)

    class Meta:
        model = Produto
        fields = ["id", "nome", "descricao", "preco", "unidade_medida", "estoque", "tipo_producao",
                  "categoria", "categoria_nome", "produtor", "produtor_nome", "nota_media"]


class ProdutoProdutorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Produto
        fields = ["id", "nome", "descricao", "preco", "unidade_medida", "estoque", "tipo_producao",
                  "categoria", "ativo", "criado_em"]
        read_only_fields = ["criado_em"]

    def validate_categoria(self, value):
        if not value.ativa:
            raise serializers.ValidationError("Categoria inativa.")
        return value
