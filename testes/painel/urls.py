from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("usuarios", views.UsuarioAdminViewSet, basename="admin-usuario")
router.register("produtores", views.ProdutorAdminViewSet, basename="admin-produtor")
router.register("produtos", views.ProdutoAdminViewSet, basename="admin-produto")
router.register("pedidos", views.PedidoAdminViewSet, basename="admin-pedido")
router.register("reclamacoes", views.ReclamacaoAdminViewSet, basename="admin-reclamacao")
router.register("avaliacoes", views.AvaliacaoAdminViewSet, basename="admin-avaliacao")
router.register("avaliacoes-clientes", views.AvaliacaoClienteAdminViewSet, basename="admin-avaliacao-cliente")

urlpatterns = [path("indicadores/", views.IndicadoresView.as_view())] + router.urls
