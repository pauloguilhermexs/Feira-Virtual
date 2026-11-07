from decimal import Decimal

from django.db.models import Count, Sum
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from avaliacoes.models import Reclamacao
from avaliacoes.serializers import ReclamacaoAdminSerializer
from catalogo.models import Produto
from catalogo.serializers import ProdutoProdutorSerializer
from pedidos.models import Pedido
from pedidos.serializers import PedidoSerializer
from usuarios.models import PerfilProdutor, Usuario
from usuarios.permissions import EhAdmin
from usuarios.serializers import PerfilProdutorSerializer, UsuarioAdminSerializer


class UsuarioAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Usuario.objects.all().order_by("-date_joined")
    serializer_class = UsuarioAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["tipo", "is_active"]
    search_fields = ["username", "email", "first_name", "last_name"]

    def _alterar(self, request, ativo):
        user = self.get_object()
        if user.pk == request.user.pk:
            raise ValidationError("Você não pode bloquear a própria conta.")
        user.is_active = ativo
        user.save(update_fields=["is_active"])
        return Response(UsuarioAdminSerializer(user).data)

    @action(detail=True, methods=["post"])
    def bloquear(self, request, pk=None):
        return self._alterar(request, False)

    @action(detail=True, methods=["post"])
    def reativar(self, request, pk=None):
        return self._alterar(request, True)


class ProdutorAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = PerfilProdutor.objects.select_related("usuario").order_by("id")
    serializer_class = PerfilProdutorSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["status"]
    search_fields = ["nome_propriedade", "usuario__username"]

    def _status(self, novo):
        perfil = self.get_object()
        perfil.status = novo
        perfil.save(update_fields=["status"])
        return Response(PerfilProdutorSerializer(perfil).data)

    @action(detail=True, methods=["post"])
    def aprovar(self, request, pk=None):
        return self._status(PerfilProdutor.Status.APROVADO)

    @action(detail=True, methods=["post"])
    def suspender(self, request, pk=None):
        return self._status(PerfilProdutor.Status.SUSPENSO)


class ProdutoAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Moderação: o administrador pode ocultar/reexibir produtos cadastrados."""
    queryset = Produto.objects.select_related("produtor", "categoria")
    serializer_class = ProdutoProdutorSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["ativo", "categoria", "produtor"]
    search_fields = ["nome"]

    @action(detail=True, methods=["post"])
    def ocultar(self, request, pk=None):
        p = self.get_object()
        p.ativo = False
        p.save(update_fields=["ativo"])
        return Response(ProdutoProdutorSerializer(p).data)

    @action(detail=True, methods=["post"])
    def reexibir(self, request, pk=None):
        p = self.get_object()
        p.ativo = True
        p.save(update_fields=["ativo"])
        return Response(ProdutoProdutorSerializer(p).data)


class PedidoAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Pedido.objects.select_related("produtor", "cliente").prefetch_related("itens", "historico")
    serializer_class = PedidoSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["status", "produtor", "cliente", "modalidade"]


class ReclamacaoAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                             viewsets.GenericViewSet):
    queryset = Reclamacao.objects.all()
    serializer_class = ReclamacaoAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["status"]
    http_method_names = ["get", "patch", "head", "options"]


class IndicadoresView(APIView):
    permission_classes = [EhAdmin]

    @extend_schema(responses=dict)
    def get(self, request):
        concluidos = Pedido.objects.filter(status=Pedido.Status.CONCLUIDO)
        return Response({
            "usuarios_por_tipo": dict(Usuario.objects.values_list("tipo").annotate(n=Count("id"))),
            "produtores_por_status": dict(PerfilProdutor.objects.values_list("status").annotate(n=Count("id"))),
            "produtos_ativos": Produto.objects.filter(ativo=True).count(),
            "pedidos_por_status": dict(Pedido.objects.values_list("status").annotate(n=Count("id"))),
            "vendas_concluidas": concluidos.count(),
            "faturamento_total": concluidos.aggregate(t=Sum("total"))["t"] or Decimal("0.00"),
            "reclamacoes_abertas": Reclamacao.objects.filter(status=Reclamacao.Status.ABERTA).count(),
        })
