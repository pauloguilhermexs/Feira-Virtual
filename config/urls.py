from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import FileResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

FRONTEND_DIR = settings.BASE_DIR / "frontend"


def frontend_view(request):
    return FileResponse(open(FRONTEND_DIR / "index.html", "rb"), content_type="text/html")


def frontend_asset(filename, content_type):
    def view(request):
        return FileResponse(open(FRONTEND_DIR / filename, "rb"), content_type=content_type)
    return view


urlpatterns = [
    path("", frontend_view, name="home"),
    path("style.css", frontend_asset("style.css", "text/css")),
    path("main.js", frontend_asset("main.js", "application/javascript")),
    path("admin/", admin.site.urls),
    path("api/", include("usuarios.urls")),
    path("api/", include("catalogo.urls")),
    path("api/", include("pedidos.urls")),
    path("api/", include("avaliacoes.urls")),
    path("api/admin/", include("painel.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
