from datetime import timedelta

from django.db.models import Avg, Count, ProtectedError, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from pedidos.models import Pedido
from usuarios.models import PerfilProdutor, Usuario
from usuarios.permissions import AdminEscreveTodosLeem, EhProdutor

from .models import Categoria, Produto
from .serializers import (CategoriaSerializer, EstatisticasPublicasSerializer,
                          ProdutoProdutorSerializer, ProdutoPublicoSerializer,
                          ProdutorPublicoSerializer)


class ProdutorPublicoViewSet(viewsets.ReadOnlyModelViewSet):
    """Vitrine pública: produtores aprovados e seus dados principais."""
    serializer_class = ProdutorPublicoSerializer
    permission_classes = [AllowAny]
    search_fields = ["nome_propriedade", "cidade", "descricao"]

    def get_queryset(self):
        return (PerfilProdutor.objects
                .filter(
                    status=PerfilProdutor.Status.APROVADO,
                    excluido_em__isnull=True,
                    usuario__is_active=True,
                )
                .annotate(
                    total_produtos=Count(
                        "produtos",
                        filter=Q(
                            produtos__ativo=True,
                            produtos__oculto_moderacao=False,
                            produtos__excluido_em__isnull=True,
                            produtos__categoria__ativa=True,
                        ),
                        distinct=True,
                    ),
                    nota_media=Avg("avaliacoes__nota"),
                    total_avaliacoes=Count("avaliacoes", distinct=True),
                )
                .order_by("nome_propriedade"))


class EstatisticasPublicasView(APIView):
    """Estatísticas agregadas reais do banco de dados para a página inicial."""
    permission_classes = [AllowAny]
    serializer_class = EstatisticasPublicasSerializer

    @extend_schema(responses={200: EstatisticasPublicasSerializer})
    def get(self, request):
        agora = timezone.now()
        sete_dias_atras = agora - timedelta(days=7)

        # Clientes com pedidos registrados nos últimos 7 dias
        pedidos_semana = Pedido.objects.filter(criado_em__gte=sete_dias_atras)
        familias_semana = pedidos_semana.values("cliente_id").distinct().count()

        total_clientes = Usuario.objects.filter(tipo=Usuario.Tipo.CLIENTE, is_active=True, excluido_em__isnull=True).count()
        total_produtores = PerfilProdutor.objects.filter(
            status=PerfilProdutor.Status.APROVADO,
            excluido_em__isnull=True,
            usuario__is_active=True,
        ).count()
        total_produtos = Produto.objects.filter(
            ativo=True,
            oculto_moderacao=False,
            excluido_em__isnull=True,
            categoria__ativa=True,
            produtor__status=PerfilProdutor.Status.APROVADO,
            produtor__excluido_em__isnull=True,
            produtor__usuario__is_active=True,
        ).count()
        pedidos_concluidos = Pedido.objects.filter(status=Pedido.Status.CONCLUIDO).count()

        return Response({
            "familias_atendidas_semana": familias_semana,
            "total_clientes": total_clientes,
            "total_produtores": total_produtores,
            "total_produtos": total_produtos,
            "total_pedidos_concluidos": pedidos_concluidos,
        })


class CategoriaViewSet(viewsets.ModelViewSet):
    """Público lista apenas categorias ativas; administrador vê todas e gerencia CRUD."""
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer
    permission_classes = [AdminEscreveTodosLeem]
    pagination_class = None

    def get_queryset(self):
        u = getattr(self.request, "user", None)
        if u and u.is_authenticated and (getattr(u, "tipo", None) == Usuario.Tipo.ADMIN or u.is_superuser):
            return Categoria.objects.all()
        return Categoria.objects.filter(ativa=True)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "Não é possível excluir esta categoria pois existem produtos vinculados a ela. "
                        "Desative a categoria em vez de excluí-la."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CatalogoViewSet(viewsets.ReadOnlyModelViewSet):
    """Catálogo público: só produtos ativos de produtores aprovados."""
    serializer_class = ProdutoPublicoSerializer
    permission_classes = [AllowAny]
    filterset_fields = ["categoria", "tipo_producao", "produtor"]
    search_fields = ["nome", "descricao"]
    ordering_fields = ["preco", "nome", "criado_em"]

    def get_queryset(self):
        return (Produto.objects
                .filter(
                    ativo=True,
                    oculto_moderacao=False,
                    excluido_em__isnull=True,
                    categoria__ativa=True,
                    produtor__status=PerfilProdutor.Status.APROVADO,
                    produtor__excluido_em__isnull=True,
                    produtor__usuario__is_active=True,
                )
                .select_related("produtor", "categoria")
                .annotate(
                    nota_media=Avg("avaliacoes__nota"),
                    total_avaliacoes=Count("avaliacoes", distinct=True),
                )
                .order_by("nome"))


class ProdutoProdutorViewSet(viewsets.ModelViewSet):
    """CRUD dos produtos do próprio produtor (regra: só no seu perfil)."""
    serializer_class = ProdutoProdutorSerializer
    permission_classes = [EhProdutor]
    filterset_fields = ["categoria", "ativo", "tipo_producao"]
    search_fields = ["nome"]
    queryset = Produto.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return Produto.objects.none()
        perfil = getattr(self.request.user, "perfil_produtor", None)
        if not perfil:
            return Produto.objects.none()
        return Produto.objects.filter(produtor=perfil, excluido_em__isnull=True)

    def perform_create(self, serializer):
        serializer.save(produtor=self.request.user.perfil_produtor)
