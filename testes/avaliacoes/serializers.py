from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from pedidos.models import ItemPedido, Pedido

from .models import Avaliacao, AvaliacaoCliente, Reclamacao


class AvaliacaoSerializer(serializers.ModelSerializer):
    cliente_nome = serializers.SerializerMethodField()
    produto_nome = serializers.CharField(source="produto.nome", read_only=True, default=None)
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True, default=None)
    pedido_numero = serializers.CharField(source="pedido.numero_publico", read_only=True, default=None)
    tipo_avaliacao = serializers.SerializerMethodField()
    nota = serializers.IntegerField(min_value=1, max_value=5)

    class Meta:
        model = Avaliacao
        fields = [
            "id", "pedido", "pedido_numero", "produto", "produto_nome",
            "produtor", "produtor_nome", "tipo_avaliacao",
            "nota", "comentario", "cliente_nome", "criado_em",
        ]
        read_only_fields = ["criado_em"]

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            fields["produto"].read_only = True
            fields["produtor"].read_only = True
            fields["pedido"].read_only = True
        return fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_cliente_nome(self, obj) -> str:
        nome = obj.cliente.get_full_name().strip()
        return nome or obj.cliente.first_name or obj.cliente.username

    @extend_schema_field(OpenApiTypes.STR)
    def get_tipo_avaliacao(self, obj) -> str:
        return "PRODUTO" if obj.produto_id else "PRODUTOR"

    def validate(self, attrs):
        if self.instance is not None:
            return attrs

        produto, produtor = attrs.get("produto"), attrs.get("produtor")
        pedido = attrs.get("pedido")
        if bool(produto) == bool(produtor):
            raise serializers.ValidationError("Informe 'produto' OU 'produtor' (apenas um).")

        user = self.context["request"].user

        if pedido is not None:
            if pedido.cliente_id != user.id:
                raise serializers.ValidationError("Você só pode avaliar compras realizadas por sua conta.")
            if pedido.status != Pedido.Status.CONCLUIDO:
                raise serializers.ValidationError("A avaliação só pode ser realizada após a conclusão do pedido.")
            if produto:
                if not ItemPedido.objects.filter(pedido=pedido, produto=produto).exists():
                    raise serializers.ValidationError("Este produto não pertence ao pedido informado.")
                if Avaliacao.objects.filter(cliente=user, produto=produto, pedido=pedido).exists():
                    raise serializers.ValidationError("Você já avaliou este produto nesta compra.")
            else:
                if pedido.produtor_id != produtor.id:
                    raise serializers.ValidationError("Este produtor não pertence ao pedido informado.")
                if Avaliacao.objects.filter(cliente=user, produtor=produtor, pedido=pedido).exists():
                    raise serializers.ValidationError("Você já avaliou este produtor nesta compra.")
            return attrs

        # Compatibilidade quando 'pedido' não é informado explicitamente: vincula a um pedido concluído ainda não avaliado
        if produto:
            pedidos_concluidos = list(
                Pedido.objects.filter(
                    cliente=user,
                    status=Pedido.Status.CONCLUIDO,
                    itens__produto=produto,
                ).distinct().order_by("-criado_em")
            )
            if not pedidos_concluidos:
                raise serializers.ValidationError("Somente clientes que compraram (pedido concluído) podem avaliar.")
            avaliados_ids = set(
                Avaliacao.objects.filter(cliente=user, produto=produto, pedido__isnull=False)
                .values_list("pedido_id", flat=True)
            )
            legado_existe = Avaliacao.objects.filter(cliente=user, produto=produto, pedido__isnull=True).exists()
            elegivel = next((p for p in pedidos_concluidos if p.id not in avaliados_ids), None)
            if elegivel is None or (legado_existe and len(pedidos_concluidos) <= 1):
                raise serializers.ValidationError("Você já avaliou este item.")
            attrs["pedido"] = elegivel
        else:
            pedidos_concluidos = list(
                Pedido.objects.filter(
                    cliente=user,
                    status=Pedido.Status.CONCLUIDO,
                    produtor=produtor,
                ).order_by("-criado_em")
            )
            if not pedidos_concluidos:
                raise serializers.ValidationError("Somente clientes que compraram (pedido concluído) podem avaliar.")
            avaliados_ids = set(
                Avaliacao.objects.filter(cliente=user, produtor=produtor, pedido__isnull=False)
                .values_list("pedido_id", flat=True)
            )
            legado_existe = Avaliacao.objects.filter(cliente=user, produtor=produtor, pedido__isnull=True).exists()
            elegivel = next((p for p in pedidos_concluidos if p.id not in avaliados_ids), None)
            if elegivel is None or (legado_existe and len(pedidos_concluidos) <= 1):
                raise serializers.ValidationError("Você já avaliou este item.")
            attrs["pedido"] = elegivel

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


class AvaliacaoClienteSerializer(serializers.ModelSerializer):
    cliente_nome = serializers.SerializerMethodField()
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True)
    pedido_numero = serializers.CharField(source="pedido.numero_publico", read_only=True)

    class Meta:
        model = AvaliacaoCliente
        fields = [
            "id", "pedido", "pedido_numero", "cliente", "cliente_nome",
            "produtor", "produtor_nome", "nota", "comentario", "criado_em",
        ]
        read_only_fields = ["cliente", "produtor", "criado_em"]

    @extend_schema_field(OpenApiTypes.STR)
    def get_cliente_nome(self, obj) -> str:
        nome = obj.cliente.get_full_name().strip()
        return nome or obj.cliente.first_name or obj.cliente.username

    def validate_pedido(self, pedido):
        user = self.context["request"].user
        perfil = getattr(user, "perfil_produtor", None)
        if not perfil or pedido.produtor_id != perfil.id:
            raise serializers.ValidationError("Você só pode avaliar clientes de pedidos da sua propriedade.")
        if pedido.status != Pedido.Status.CONCLUIDO:
            raise serializers.ValidationError("A avaliação do cliente só é permitida após a conclusão do pedido.")
        if AvaliacaoCliente.objects.filter(pedido=pedido).exists():
            raise serializers.ValidationError("Você já avaliou o cliente para este pedido.")
        return pedido
