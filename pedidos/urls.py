from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("carrinho/itens", views.ItemCarrinhoViewSet, basename="carrinho-item")
router.register("pedidos", views.PedidoClienteViewSet, basename="pedido")
router.register("produtor/pedidos", views.PedidoProdutorViewSet, basename="produtor-pedido")
router.register("entregas", views.EntregaViewSet, basename="entrega")

urlpatterns = [path("carrinho/", views.CarrinhoView.as_view())] + router.urls
