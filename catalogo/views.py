from django.db.models import Avg
from rest_framework import mixins, viewsets
from rest_framework.permissions import AllowAny

from usuarios.models import PerfilProdutor
from usuarios.permissions import AdminEscreveTodosLeem, EhProdutor

from .models import Categoria, Produto
from .serializers import CategoriaSerializer, ProdutoProdutorSerializer, ProdutoPublicoSerializer


class CategoriaViewSet(viewsets.ModelViewSet):
    """Qualquer um lista; só o administrador cria/edita/remove."""
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer
    permission_classes = [AdminEscreveTodosLeem]
    pagination_class = None


class CatalogoViewSet(viewsets.ReadOnlyModelViewSet):
    """Catálogo público: só produtos ativos de produtores aprovados."""
    serializer_class = ProdutoPublicoSerializer
    permission_classes = [AllowAny]
    filterset_fields = ["categoria", "tipo_producao", "produtor"]
    search_fields = ["nome", "descricao"]
    ordering_fields = ["preco", "nome", "criado_em"]

    def get_queryset(self):
        return (Produto.objects
                .filter(ativo=True, categoria__ativa=True, produtor__status=PerfilProdutor.Status.APROVADO)
                .select_related("produtor", "categoria")
                .annotate(nota_media=Avg("avaliacoes__nota"))
                .order_by("nome"))


class ProdutoProdutorViewSet(viewsets.ModelViewSet):
    """CRUD dos produtos do próprio produtor (regra: só no seu perfil)."""
    serializer_class = ProdutoProdutorSerializer
    permission_classes = [EhProdutor]
    filterset_fields = ["categoria", "ativo", "tipo_producao"]
    search_fields = ["nome"]

    def get_queryset(self):
        return Produto.objects.filter(produtor=self.request.user.perfil_produtor)

    def perform_create(self, serializer):
        serializer.save(produtor=self.request.user.perfil_produtor)
