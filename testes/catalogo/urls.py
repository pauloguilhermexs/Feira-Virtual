from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("categorias", views.CategoriaViewSet, basename="categoria")
router.register("produtos", views.CatalogoViewSet, basename="produto")
router.register("produtores", views.ProdutorPublicoViewSet, basename="produtor-publico")
router.register("produtor/produtos", views.ProdutoProdutorViewSet, basename="produtor-produto")

urlpatterns = [
    path("estatisticas/", views.EstatisticasPublicasView.as_view(), name="estatisticas-publicas"),
] + router.urls
