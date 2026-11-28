from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import include, path
from django.views.generic import TemplateView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny, IsAdminUser

FRONTEND_DIR = settings.BASE_DIR / "frontend"
ASSETS_DIR = FRONTEND_DIR / "assets"


def frontend_assets_view(request, filename):
    """Serve arquivos da pasta frontend/assets/ com cache headers e proteção contra path traversal."""
    from django.http import Http404

    base_dir = ASSETS_DIR.resolve()
    asset_path = (ASSETS_DIR / filename).resolve()
    try:
        asset_path.relative_to(base_dir)
    except ValueError:
        raise Http404("Caminho inválido.")
    if not asset_path.exists() or not asset_path.is_file():
        raise Http404(f"Asset '{filename}' não encontrado.")
    content_types = {
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    ct = content_types.get(asset_path.suffix.lower(), "application/octet-stream")
    response = FileResponse(open(asset_path, "rb"), content_type=ct)
    # Cache imutável para assets com hash; mais curto para o manifest
    if asset_path.suffix in (".webmanifest", ".json"):
        response["Cache-Control"] = "public, max-age=3600"
    else:
        response["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


def health_view(request):
    """Endpoint de saúde para load balancers e Docker HEALTHCHECK."""
    from django.db import connection
    try:
        connection.ensure_connection()
        db_ok = True
    except Exception:
        db_ok = False
    status = 200 if db_ok else 503
    import json
    return HttpResponse(
        json.dumps({"status": "ok" if db_ok else "degraded", "db": db_ok}),
        content_type="application/json",
        status=status,
    )


def media_serve_view(request, path):
    """Serve arquivos de mídia enviados por upload com proteção traversal e cache."""
    media_file = (settings.MEDIA_ROOT / path).resolve()
    try:
        media_file.relative_to(settings.MEDIA_ROOT.resolve())
    except ValueError:
        from django.http import Http404
        raise Http404("Caminho inválido.")

    if not media_file.exists() or not media_file.is_file():
        from django.http import Http404
        raise Http404("Arquivo não encontrado.")

    import mimetypes
    ct, _ = mimetypes.guess_type(str(media_file))
    response = FileResponse(open(media_file, "rb"), content_type=ct or "application/octet-stream")
    response["Cache-Control"] = "public, max-age=86400"
    return response


def config_publica_view(request):
    """Configurações públicas leves para o frontend (atalhos demo apenas quando SHOW_DEMO_SHORTCUTS=1)."""
    import json
    from decimal import Decimal

    taxa = max(Decimal("0.00"), Decimal(str(getattr(settings, "TAXA_ENTREGA_PADRAO", "0.00"))))
    show_demo = bool(getattr(settings, "SHOW_DEMO_SHORTCUTS", False))
    payload = {
        "demo": show_demo,
        "taxa_entrega_padrao": f"{taxa:.2f}",
    }
    if show_demo:
        payload["demo_accounts"] = [
            {"label": "cliente_demo", "username": "cliente_demo", "password": "cliente-demo-2024"},
            {"label": "produtor_demo", "username": "produtor_demo", "password": "produtor-demo-2024"},
            {"label": "entregador_demo", "username": "entregador_demo", "password": "entregador-demo-2024"},
            {"label": "admin", "username": "admin", "password": "admin-demo-2024"},
        ]
    return HttpResponse(json.dumps(payload), content_type="application/json", status=200)


swagger_perms = [AllowAny] if getattr(settings, "ENABLE_SWAGGER", False) else [IsAdminUser]

urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
    path("assets/<path:filename>", frontend_assets_view, name="frontend-asset"),
    path("media/<path:path>", media_serve_view, name="media-serve"),
    path("admin/", admin.site.urls),
    path("api/", include("usuarios.urls")),
    path("api/", include("catalogo.urls")),
    path("api/", include("pedidos.urls")),
    path("api/", include("avaliacoes.urls")),
    path("api/admin/", include("painel.urls")),
    path("api/config/", config_publica_view, name="config-publica"),
    path("api/health/", health_view, name="health"),
    path("api/schema/", SpectacularAPIView.as_view(permission_classes=swagger_perms), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema", permission_classes=swagger_perms), name="docs"),
]
