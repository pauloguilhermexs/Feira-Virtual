from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from avaliacoes.models import Avaliacao, AvaliacaoCliente, Reclamacao
from avaliacoes.serializers import AvaliacaoClienteSerializer, AvaliacaoSerializer, ReclamacaoAdminSerializer
from catalogo.models import Produto
from catalogo.serializers import ProdutoProdutorSerializer
from painel.models import LogAuditoria
from pedidos.models import ItemCarrinho, ItemPedido, Pedido
from pedidos.serializers import PedidoSerializer
from usuarios.models import PerfilProdutor, Usuario
from usuarios.permissions import EhAdmin
from usuarios.serializers import PerfilProdutorSerializer, UsuarioAdminSerializer


def registrar_auditoria(request, acao, descricao):
    ip = request.META.get("HTTP_X_FORWARDED_FOR")
    if ip:
        ip = ip.split(",")[0].strip()
    else:
        ip = request.META.get("REMOTE_ADDR")
    LogAuditoria.objects.create(
        usuario=request.user,
        acao=acao,
        descricao=descricao[:255],
        ip=ip,
    )


class ProdutorAdminSerializer(PerfilProdutorSerializer):
    usuario_id = serializers.IntegerField(source="usuario.id", read_only=True)
    usuario_username = serializers.CharField(source="usuario.username", read_only=True)
    usuario_email = serializers.EmailField(source="usuario.email", read_only=True)
    usuario_ativo = serializers.BooleanField(source="usuario.is_active", read_only=True)
    total_produtos = serializers.IntegerField(read_only=True, default=0)
    total_pedidos = serializers.IntegerField(read_only=True, default=0)
    total_avaliacoes = serializers.IntegerField(read_only=True, default=0)

    class Meta(PerfilProdutorSerializer.Meta):
        fields = PerfilProdutorSerializer.Meta.fields + [
            "excluido_em", "usuario_id", "usuario_username", "usuario_email",
            "usuario_ativo", "total_produtos", "total_pedidos", "total_avaliacoes",
        ]


class ProdutoAdminSerializer(ProdutoProdutorSerializer):
    produtor_nome = serializers.CharField(source="produtor.nome_propriedade", read_only=True)
    categoria_nome = serializers.CharField(source="categoria.nome", read_only=True)

    class Meta(ProdutoProdutorSerializer.Meta):
        fields = ProdutoProdutorSerializer.Meta.fields + [
            "produtor", "produtor_nome", "categoria_nome", "excluido_em",
        ]
        read_only_fields = ["criado_em", "produtor", "excluido_em"]


class UsuarioAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin,
                          viewsets.GenericViewSet):
    serializer_class = UsuarioAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["tipo", "is_active"]
    search_fields = ["username", "email", "first_name", "last_name"]

    def get_queryset(self):
        return (
            Usuario.objects.all()
            .annotate(
                total_pedidos=Count("pedidos", distinct=True),
                total_avaliacoes=Count("avaliacoes", distinct=True),
            )
            .order_by("-date_joined")
        )

    def _alterar(self, request, ativo):
        user = self.get_object()
        if user.pk == request.user.pk:
            raise ValidationError("Você não pode bloquear a própria conta.")
        user.is_active = ativo
        if ativo:
            user.excluido_em = None
            user.save(update_fields=["is_active", "excluido_em"])
        else:
            user.save(update_fields=["is_active"])
        acao = LogAuditoria.Acao.REATIVAR_USUARIO if ativo else LogAuditoria.Acao.BLOQUEAR_USUARIO
        registrar_auditoria(request, acao, f"{'Reativado' if ativo else 'Bloqueado'} usuário {user.username} (ID: {user.pk})")
        return Response(UsuarioAdminSerializer(user).data)

    @action(detail=True, methods=["post"])
    def bloquear(self, request, pk=None):
        return self._alterar(request, False)

    @action(detail=True, methods=["post"])
    def reativar(self, request, pk=None):
        return self._alterar(request, True)

    @action(detail=True, methods=["get"])
    def detalhes(self, request, pk=None):
        user = self.get_object()
        pedidos = Pedido.objects.filter(cliente=user).select_related("produtor").order_by("-criado_em")[:20]
        avaliacoes = Avaliacao.objects.filter(cliente=user).select_related("produto", "produtor", "pedido").order_by("-criado_em")[:20]
        return Response({
            "usuario": UsuarioAdminSerializer(user).data,
            "pedidos": [
                {
                    "id": p.id,
                    "numero_publico": p.numero_publico,
                    "produtor_nome": p.produtor.nome_propriedade,
                    "status": p.status,
                    "total_com_frete": str(p.total_com_frete),
                    "criado_em": p.criado_em.isoformat(),
                }
                for p in pedidos
            ],
            "avaliacoes": AvaliacaoSerializer(avaliacoes, many=True).data,
        })

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.pk == request.user.pk or user.is_superuser:
            raise ValidationError("Não é permitido excluir ou desativar a própria conta administrativa ou um superusuário.")
        if user.tipo == Usuario.Tipo.ADMIN:
            outros_admins = Usuario.objects.filter(tipo=Usuario.Tipo.ADMIN, is_active=True).exclude(pk=user.pk).count()
            if outros_admins == 0:
                raise ValidationError("Não é possível remover o último administrador ativo do sistema.")

        perfil_prod = getattr(user, "perfil_produtor", None)
        tem_historico = (
            Pedido.objects.filter(cliente=user).exists()
            or Pedido.objects.filter(entregador=user).exists()
            or Avaliacao.objects.filter(cliente=user).exists()
            or AvaliacaoCliente.objects.filter(cliente=user).exists()
            or Reclamacao.objects.filter(cliente=user).exists()
            or (
                perfil_prod is not None
                and (
                    Pedido.objects.filter(produtor=perfil_prod).exists()
                    or Produto.objects.filter(produtor=perfil_prod).exists()
                    or Avaliacao.objects.filter(produtor=perfil_prod).exists()
                )
            )
        )

        if tem_historico:
            agora = timezone.now()
            user.is_active = False
            user.excluido_em = agora
            user.save(update_fields=["is_active", "excluido_em"])
            if perfil_prod is not None:
                perfil_prod.status = PerfilProdutor.Status.SUSPENSO
                perfil_prod.excluido_em = agora
                perfil_prod.save(update_fields=["status", "excluido_em"])
                Produto.objects.filter(produtor=perfil_prod).update(ativo=False)
            registrar_auditoria(
                request,
                LogAuditoria.Acao.DESATIVAR_USUARIO,
                f"Usuário {user.username} (ID: {user.pk}) desativado logicamente preservando histórico",
            )
            return Response(
                {
                    "acao": "desativado",
                    "detail": (
                        f"O usuário '{user.username}' possui histórico de pedidos ou avaliações e foi desativado "
                        "para preservar a integridade dos registros."
                    ),
                },
                status=status.HTTP_200_OK,
            )

        username = user.username
        uid = user.pk
        user.delete()
        registrar_auditoria(
            request,
            LogAuditoria.Acao.EXCLUIR_USUARIO,
            f"Usuário {username} (ID: {uid}) excluído definitivamente (sem histórico vinculado)",
        )
        return Response(
            {"acao": "excluido", "detail": f"Usuário '{username}' excluído definitivamente."},
            status=status.HTTP_200_OK,
        )


class ProdutorAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin,
                           viewsets.GenericViewSet):
    serializer_class = ProdutorAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["status"]
    search_fields = ["nome_propriedade", "cidade", "usuario__username", "usuario__email"]

    def get_queryset(self):
        return (
            PerfilProdutor.objects.select_related("usuario")
            .annotate(
                total_produtos=Count("produtos", distinct=True),
                total_pedidos=Count("pedidos", distinct=True),
                total_avaliacoes=Count("avaliacoes", distinct=True),
            )
            .order_by("id")
        )

    def _status(self, request, novo):
        perfil = self.get_object()
        perfil.status = novo
        if novo == PerfilProdutor.Status.APROVADO:
            perfil.excluido_em = None
            perfil.save(update_fields=["status", "excluido_em"])
            if not perfil.usuario.is_active:
                perfil.usuario.is_active = True
                perfil.usuario.excluido_em = None
                perfil.usuario.save(update_fields=["is_active", "excluido_em"])
        else:
            perfil.save(update_fields=["status"])
        acao = LogAuditoria.Acao.APROVAR_PRODUTOR if novo == PerfilProdutor.Status.APROVADO else LogAuditoria.Acao.SUSPENDER_PRODUTOR
        registrar_auditoria(request, acao, f"Produtor {perfil.nome_propriedade} alterado para {novo}")
        return Response(ProdutorAdminSerializer(self.get_queryset().get(pk=perfil.pk)).data)

    @action(detail=True, methods=["post"])
    def aprovar(self, request, pk=None):
        return self._status(request, PerfilProdutor.Status.APROVADO)

    @action(detail=True, methods=["post"])
    def suspender(self, request, pk=None):
        return self._status(request, PerfilProdutor.Status.SUSPENSO)

    @action(detail=True, methods=["get"])
    def detalhes(self, request, pk=None):
        perfil = self.get_object()
        produtos = Produto.objects.filter(produtor=perfil).select_related("categoria").order_by("nome")
        return Response({
            "produtor": ProdutorAdminSerializer(perfil).data,
            "produtos": [
                {
                    "id": p.id,
                    "nome": p.nome,
                    "categoria_nome": p.categoria.nome,
                    "preco": str(p.preco),
                    "estoque": str(p.estoque),
                    "ativo": p.ativo,
                    "excluido_em": p.excluido_em.isoformat() if p.excluido_em else None,
                }
                for p in produtos
            ],
        })

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        perfil = self.get_object()
        user = perfil.usuario
        if user.pk == request.user.pk or user.is_superuser:
            raise ValidationError("Não é permitido remover a conta administrativa.")

        tem_vinculos = (
            Pedido.objects.filter(produtor=perfil).exists()
            or Produto.objects.filter(produtor=perfil).exists()
            or Avaliacao.objects.filter(produtor=perfil).exists()
            or AvaliacaoCliente.objects.filter(produtor=perfil).exists()
            or Pedido.objects.filter(cliente=user).exists()
        )

        if tem_vinculos:
            agora = timezone.now()
            perfil.status = PerfilProdutor.Status.SUSPENSO
            perfil.excluido_em = agora
            perfil.save(update_fields=["status", "excluido_em"])
            user.is_active = False
            user.excluido_em = agora
            user.save(update_fields=["is_active", "excluido_em"])
            Produto.objects.filter(produtor=perfil).update(ativo=False)
            ItemCarrinho.objects.filter(produto__produtor=perfil).delete()
            registrar_auditoria(
                request,
                LogAuditoria.Acao.DESATIVAR_PRODUTOR,
                f"Produtor '{perfil.nome_propriedade}' (ID: {perfil.pk}) desativado preservando histórico",
            )
            return Response(
                {
                    "acao": "desativado",
                    "detail": (
                        f"O produtor '{perfil.nome_propriedade}' possui produtos, pedidos ou avaliações vinculados "
                        "e foi desativado para preservar o histórico."
                    ),
                },
                status=status.HTTP_200_OK,
            )

        nome = perfil.nome_propriedade
        pid = perfil.pk
        perfil.delete()
        user.delete()
        registrar_auditoria(
            request,
            LogAuditoria.Acao.EXCLUIR_PRODUTOR,
            f"Produtor '{nome}' (ID: {pid}) excluído definitivamente (sem vínculos)",
        )
        return Response(
            {"acao": "excluido", "detail": f"Produtor '{nome}' excluído definitivamente."},
            status=status.HTTP_200_OK,
        )


class ProdutoAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                          mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Moderação: o administrador pode consultar, editar, ocultar/reexibir e excluir/desativar produtos."""
    queryset = Produto.objects.select_related("produtor", "categoria").order_by("nome")
    serializer_class = ProdutoAdminSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["ativo", "oculto_moderacao", "categoria", "produtor"]
    search_fields = ["nome", "descricao", "produtor__nome_propriedade"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_update(self, serializer):
        p = serializer.save()
        registrar_auditoria(self.request, LogAuditoria.Acao.EDITAR_PRODUTO, f"Produto '{p.nome}' (ID: {p.pk}) editado pelo admin")

    @action(detail=True, methods=["post"])
    def ocultar(self, request, pk=None):
        p = self.get_object()
        p.oculto_moderacao = True
        p.ativo = False
        p.save(update_fields=["oculto_moderacao", "ativo"])
        registrar_auditoria(request, LogAuditoria.Acao.OCULTAR_PRODUTO, f"Produto '{p.nome}' ocultado pela moderação admin")
        return Response(ProdutoAdminSerializer(p).data)

    @action(detail=True, methods=["post"])
    def reexibir(self, request, pk=None):
        p = self.get_object()
        p.oculto_moderacao = False
        p.ativo = True
        p.excluido_em = None
        p.save(update_fields=["oculto_moderacao", "ativo", "excluido_em"])
        registrar_auditoria(request, LogAuditoria.Acao.REEXIBIR_PRODUTO, f"Produto '{p.nome}' reexibido pelo admin")
        return Response(ProdutoAdminSerializer(p).data)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        p = self.get_object()
        ItemCarrinho.objects.filter(produto=p).delete()
        tem_historico = ItemPedido.objects.filter(produto=p).exists() or Avaliacao.objects.filter(produto=p).exists()

        if tem_historico:
            p.ativo = False
            p.excluido_em = timezone.now()
            p.save(update_fields=["ativo", "excluido_em"])
            registrar_auditoria(
                request,
                LogAuditoria.Acao.DESATIVAR_PRODUTO,
                f"Produto '{p.nome}' (ID: {p.pk}) desativado logicamente (vinculado a pedidos/avaliações)",
            )
            return Response(
                {
                    "acao": "desativado",
                    "detail": (
                        f"O produto '{p.nome}' possui pedidos ou avaliações históricas e foi desativado "
                        "(ocultado do catálogo preservando o histórico)."
                    ),
                },
                status=status.HTTP_200_OK,
            )

        nome = p.nome
        pid = p.pk
        p.delete()
        registrar_auditoria(
            request,
            LogAuditoria.Acao.EXCLUIR_PRODUTO,
            f"Produto '{nome}' (ID: {pid}) excluído definitivamente (sem pedidos/avaliações)",
        )
        return Response(
            {"acao": "excluido", "detail": f"Produto '{nome}' excluído definitivamente."},
            status=status.HTTP_200_OK,
        )


class PedidoAdminViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Pedido.objects.select_related("produtor", "cliente", "avaliacao_cliente").prefetch_related("itens", "historico", "avaliacoes")
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

    def perform_update(self, serializer):
        rec = serializer.save()
        registrar_auditoria(
            self.request,
            LogAuditoria.Acao.MODERAR_RECLAMACAO,
            f"Reclamação #{rec.pk} moderada para status {rec.status}",
        )


class AvaliacaoAdminViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Consulta administrativa de avaliações realizadas pelos clientes (produtos e produtores)."""
    queryset = Avaliacao.objects.select_related("cliente", "produto", "produtor", "pedido")
    serializer_class = AvaliacaoSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["produto", "produtor", "pedido", "nota"]


class AvaliacaoClienteAdminViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Consulta administrativa de avaliações de clientes realizadas pelos produtores."""
    queryset = AvaliacaoCliente.objects.select_related("cliente", "produtor", "pedido")
    serializer_class = AvaliacaoClienteSerializer
    permission_classes = [EhAdmin]
    filterset_fields = ["produtor", "cliente", "pedido", "nota"]


class IndicadoresView(APIView):
    permission_classes = [EhAdmin]

    @extend_schema(responses=dict)
    def get(self, request):
        concluidos = Pedido.objects.filter(status=Pedido.Status.CONCLUIDO)
        return Response({
            "usuarios_por_tipo": dict(Usuario.objects.values_list("tipo").annotate(n=Count("id"))),
            "produtores_por_status": dict(PerfilProdutor.objects.values_list("status").annotate(n=Count("id"))),
            "produtos_ativos": Produto.objects.filter(
                ativo=True, oculto_moderacao=False, excluido_em__isnull=True, categoria__ativa=True
            ).count(),
            "pedidos_por_status": dict(Pedido.objects.values_list("status").annotate(n=Count("id"))),
            "vendas_concluidas": concluidos.count(),
            "faturamento_total": concluidos.aggregate(t=Sum("total"))["t"] or Decimal("0.00"),
            "reclamacoes_abertas": Reclamacao.objects.filter(status=Reclamacao.Status.ABERTA).count(),
            "total_avaliacoes": Avaliacao.objects.count() + AvaliacaoCliente.objects.count(),
        })
