from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("usuarios", views.UsuarioAdminViewSet, basename="admin-usuario")
router.register("produtores", views.ProdutorAdminViewSet, basename="admin-produtor")
router.register("produtos", views.ProdutoAdminViewSet, basename="admin-produto")
router.register("pedidos", views.PedidoAdminViewSet, basename="admin-pedido")
router.register("reclamacoes", views.ReclamacaoAdminViewSet, basename="admin-reclamacao")

urlpatterns = [path("indicadores/", views.IndicadoresView.as_view())] + router.urls
