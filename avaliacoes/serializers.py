from rest_framework import serializers

from pedidos.models import ItemPedido, Pedido

from .models import Avaliacao, Reclamacao


class AvaliacaoSerializer(serializers.ModelSerializer):
    cliente_nome = serializers.CharField(source="cliente.first_name", read_only=True)

    class Meta:
        model = Avaliacao
        fields = ["id", "produto", "produtor", "nota", "comentario", "cliente_nome", "criado_em"]
        read_only_fields = ["criado_em"]

    def validate(self, attrs):
        produto, produtor = attrs.get("produto"), attrs.get("produtor")
        if bool(produto) == bool(produtor):
            raise serializers.ValidationError("Informe 'produto' OU 'produtor' (apenas um).")
        user = self.context["request"].user
        if produto:
            comprou = ItemPedido.objects.filter(produto=produto, pedido__cliente=user,
                                                pedido__status=Pedido.Status.CONCLUIDO).exists()
            ja = Avaliacao.objects.filter(cliente=user, produto=produto).exists()
        else:
            comprou = Pedido.objects.filter(produtor=produtor, cliente=user,
                                            status=Pedido.Status.CONCLUIDO).exists()
            ja = Avaliacao.objects.filter(cliente=user, produtor=produtor).exists()
        if not comprou:
            raise serializers.ValidationError("Somente clientes que compraram (pedido concluído) podem avaliar.")
        if ja:
            raise serializers.ValidationError("Você já avaliou este item.")
        return attrs


class ReclamacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reclamacao
        fields = ["id", "pedido", "assunto", "descricao", "status", "resposta_admin", "criado_em"]
        read_only_fields = ["status", "resposta_admin", "criado_em"]

    def validate_pedido(self, pedido):
        if pedido.cliente_id != self.context["request"].user.id:
            raise serializers.ValidationError("Pedido não encontrado.")
        return pedido


class ReclamacaoAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reclamacao
        fields = ["id", "cliente", "pedido", "assunto", "descricao", "status", "resposta_admin", "criado_em"]
        read_only_fields = ["cliente", "pedido", "assunto", "descricao", "criado_em"]
