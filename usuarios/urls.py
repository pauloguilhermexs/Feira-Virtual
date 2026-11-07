from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

router = DefaultRouter()
router.register("enderecos", views.EnderecoViewSet, basename="endereco")

urlpatterns = [
    path("auth/registro/cliente/", views.RegistroClienteView.as_view()),
    path("auth/registro/produtor/", views.RegistroProdutorView.as_view()),
    path("auth/registro/entregador/", views.RegistroEntregadorView.as_view()),
    path("auth/login/", TokenObtainPairView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/logout/", views.LogoutView.as_view()),
    path("auth/recuperar-senha/", views.RecuperarSenhaView.as_view()),
    path("auth/redefinir-senha/", views.RedefinirSenhaView.as_view()),
    path("perfil/", views.MeuPerfilView.as_view()),
    path("perfil/produtor/", views.PerfilProdutorView.as_view()),
    path("perfil/entregador/", views.PerfilEntregadorView.as_view()),
    path("", include(router.urls)),
]
