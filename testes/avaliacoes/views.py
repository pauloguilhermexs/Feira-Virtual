from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, AllowAny
from rest_framework.response import Response

from usuarios.permissions import EhCliente, EhProdutor

from .models import Avaliacao, AvaliacaoCliente, Reclamacao
from .serializers import AvaliacaoClienteSerializer, AvaliacaoSerializer, ReclamacaoSerializer


class AvaliacaoViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                       mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Qualquer um vê as avaliações (?produto=ID ou ?produtor=ID); só quem comprou avalia e só o autor edita/exclui."""
    queryset = Avaliacao.objects.select_related("cliente", "produto", "produtor", "pedido")
    serializer_class = AvaliacaoSerializer
    filterset_fields = ["produto", "produtor", "pedido"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action == "minhas":
            return [EhCliente()]
        return [AllowAny()] if self.request.method in SAFE_METHODS else [EhCliente()]

    def perform_create(self, serializer):
        serializer.save(cliente=self.request.user)

    def _garantir_autor(self, obj):
        if obj.cliente_id != self.request.user.id:
            raise PermissionDenied("Você só pode alterar ou excluir suas próprias avaliações.")

    def perform_update(self, serializer):
        self._garantir_autor(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._garantir_autor(instance)
        instance.delete()

    @action(detail=False, methods=["get"])
    def minhas(self, request):
        """Histórico de avaliações realizadas pelo cliente autenticado."""
        qs = self.get_queryset().filter(cliente=request.user)
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(qs, many=True).data)


class AvaliacaoProdutorViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Produtor consulta as avaliações recebidas (nele ou nos seus produtos)."""
    serializer_class = AvaliacaoSerializer
    permission_classes = [EhProdutor]
    queryset = Avaliacao.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return Avaliacao.objects.none()
        perfil = getattr(self.request.user, "perfil_produtor", None)
        if not perfil:
            return Avaliacao.objects.none()
        return (Avaliacao.objects
                .filter(Q(produtor=perfil) | Q(produto__produtor=perfil))
                .select_related("cliente", "produto", "produtor"))


class AvaliacaoClienteProdutorViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Produtor avalia o cliente de um pedido concluído e consulta as avaliações que realizou."""
    serializer_class = AvaliacaoClienteSerializer
    permission_classes = [EhProdutor]
    queryset = AvaliacaoCliente.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return AvaliacaoCliente.objects.none()
        perfil = getattr(self.request.user, "perfil_produtor", None)
        if not perfil:
            return AvaliacaoCliente.objects.none()
        return (AvaliacaoCliente.objects
                .filter(produtor=perfil)
                .select_related("cliente", "produtor", "pedido"))

    def perform_create(self, serializer):
        pedido = serializer.validated_data["pedido"]
        serializer.save(produtor=self.request.user.perfil_produtor, cliente=pedido.cliente)


class ReclamacaoViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = ReclamacaoSerializer
    permission_classes = [EhCliente]
    queryset = Reclamacao.objects.none()

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return Reclamacao.objects.none()
        return Reclamacao.objects.filter(cliente=self.request.user)

    def perform_create(self, serializer):
        serializer.save(cliente=self.request.user)
