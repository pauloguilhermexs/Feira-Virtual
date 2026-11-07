from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.permissions import SAFE_METHODS, AllowAny

from usuarios.permissions import EhCliente, EhProdutor

from .models import Avaliacao, Reclamacao
from .serializers import AvaliacaoSerializer, ReclamacaoSerializer


class AvaliacaoViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Qualquer um vê as avaliações (?produto=ID ou ?produtor=ID); só quem comprou avalia."""
    queryset = Avaliacao.objects.select_related("cliente")
    serializer_class = AvaliacaoSerializer
    filterset_fields = ["produto", "produtor"]

    def get_permissions(self):
        return [AllowAny()] if self.request.method in SAFE_METHODS else [EhCliente()]

    def perform_create(self, serializer):
        serializer.save(cliente=self.request.user)


class AvaliacaoProdutorViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Produtor consulta as avaliações recebidas (nele ou nos seus produtos)."""
    serializer_class = AvaliacaoSerializer
    permission_classes = [EhProdutor]

    def get_queryset(self):
        perfil = self.request.user.perfil_produtor
        return Avaliacao.objects.filter(Q(produtor=perfil) | Q(produto__produtor=perfil))


class ReclamacaoViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = ReclamacaoSerializer
    permission_classes = [EhCliente]

    def get_queryset(self):
        return Reclamacao.objects.filter(cliente=self.request.user)

    def perform_create(self, serializer):
        serializer.save(cliente=self.request.user)
