from rest_framework import serializers

from usuarios.models import Endereco

from .models import Carrinho, HistoricoStatus, ItemCarrinho, ItemPedido, Pedido


class ItemCarrinhoSerializer(serializers.ModelSerializer):
    produto_nome = serializers.CharField(source="produto.nome", read_only=True)
    preco_unitario = serializers.DecimalField(source="produto.preco", max_digits=10, decimal_places=2, read_only=True)
    unidade_medida = serializers.CharField(source="produto.unidade_medida", read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ItemCarrinho
        fields = ["id", "produto", "produto_nome", "preco_unitario", "unidade_medida", "quantidade", "subtotal"]

    def validate(self, attrs):
        produto = attrs.get("produto") or self.instance.produto
        qtd = attrs.get("quantidade", getattr(self.instance, "quantidade", 0))
        if not produto.ativo or produto.produtor.status != "APROVADO":
            raise serializers.ValidationError("Produto indisponível.")
        if self.instance is None:  # soma com o que já está no carrinho
            existente = ItemCarrinho.objects.filter(
                carrinho=self.context["carrinho"], produto=produto).first()
            if existente:
                qtd = qtd + existente.quantidade
        if qtd > produto.estoque:
            raise serializers.ValidationError(f"Quantidade acima do estoque disponível ({produto.estoque}).")
        return attrs


class CarrinhoSerializer(serializers.ModelSerializer):
    itens = ItemCarrinhoSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Carrinho
        fields = ["id", "itens", "total"]


class ItemPedidoSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ItemPedido
        fields = ["id", "produto", "nome_produto", "unidade_medida", "preco_unitario", "quantidade", "subtotal"]


class HistoricoSerializer(serializers.ModelSerializer):
    class Meta:
        model = HistoricoStatus
        fields = ["status", "criado_em"]


class PedidoSerializer(serializers.ModelSerializer):
    itens = ItemPedidoSerializer(many=True, read_only=True)
    historico = HistoricoSerializer(many=True, read_only=True)
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True)
    cliente_nome = serializers.CharField(source="cliente.get_full_name", read_only=True)

    class Meta:
        model = Pedido
        fields = ["id", "status", "modalidade", "forma_pagamento", "endereco_entrega", "observacao", "total",
                  "produtor", "produtor_nome", "cliente", "cliente_nome", "entregador",
                  "itens", "historico", "criado_em", "atualizado_em"]
        read_only_fields = fields


class CheckoutSerializer(serializers.Serializer):
    modalidade = serializers.ChoiceField(choices=Pedido.Modalidade.choices)
    forma_pagamento = serializers.ChoiceField(choices=Pedido.FormaPagamento.choices)
    endereco_id = serializers.IntegerField(required=False)
    observacao = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        endereco = None
        if attrs["modalidade"] == Pedido.Modalidade.ENTREGA:
            if "endereco_id" not in attrs:
                raise serializers.ValidationError({"endereco_id": "Informe o endereço de entrega."})
            try:
                endereco = Endereco.objects.get(pk=attrs["endereco_id"], usuario=self.context["request"].user)
            except Endereco.DoesNotExist:
                raise serializers.ValidationError({"endereco_id": "Endereço não encontrado."})
        attrs["endereco"] = endereco
        return attrs


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Pedido.Status.choices)
