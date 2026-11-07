from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("categorias", views.CategoriaViewSet, basename="categoria")
router.register("produtos", views.CatalogoViewSet, basename="produto")
router.register("produtor/produtos", views.ProdutoProdutorViewSet, basename="produtor-produto")
urlpatterns = router.urls
