from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("avaliacoes", views.AvaliacaoViewSet, basename="avaliacao")
router.register("produtor/avaliacoes", views.AvaliacaoProdutorViewSet, basename="produtor-avaliacao")
router.register("produtor/avaliacoes-clientes", views.AvaliacaoClienteProdutorViewSet, basename="produtor-avaliacao-cliente")
router.register("reclamacoes", views.ReclamacaoViewSet, basename="reclamacao")
urlpatterns = router.urls
