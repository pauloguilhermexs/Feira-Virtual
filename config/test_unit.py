"""Testes de unidade do módulo `config` (validadores, middleware CSP e views auxiliares)."""
import json
import tempfile
from io import BytesIO
from pathlib import Path
from unittest import mock

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import Http404, HttpResponse
from django.test import SimpleTestCase, override_settings
from PIL import Image
from rest_framework.test import APIRequestFactory

from config.middleware import ContentSecurityPolicyMiddleware
from config.urls import config_publica_view, frontend_assets_view, health_view, media_serve_view
from config.validators import MAX_UPLOAD_SIZE, validar_imagem_upload


def _gerar_imagem_upload(nome="foto.png", formato="PNG", tamanho=(32, 32), content_type="image/png"):
    buf = BytesIO()
    Image.new("RGB", tamanho, color=(36, 111, 17)).save(buf, format=formato)
    return SimpleUploadedFile(nome, buf.getvalue(), content_type=content_type)


class ValidarImagemUploadUnitTests(SimpleTestCase):
    """Testa isoladamente a função `validar_imagem_upload`."""

    def test_aceita_png_jpeg_webp_validos_e_reposiciona_ponteiro(self):
        casos = [
            ("horta.png", "PNG", "image/png"),
            ("SITIO.JPG", "JPEG", "image/jpeg"),
            ("feira.jpeg", "JPEG", "image/jpeg"),
            ("cesta.webp", "WEBP", "image/webp"),
        ]
        for nome, formato, ct in casos:
            with self.subTest(nome=nome):
                arquivo = _gerar_imagem_upload(nome=nome, formato=formato, content_type=ct)
                arquivo.read(4)  # desloca o ponteiro propositalmente antes de validar
                validar_imagem_upload(arquivo)
                self.assertEqual(arquivo.tell(), 0)

    def test_rejeita_arquivo_acima_do_limite_de_5mb(self):
        arquivo_grande = mock.MagicMock()
        arquivo_grande.size = MAX_UPLOAD_SIZE + 1
        arquivo_grande.name = "enorme.png"

        with self.assertRaises(ValidationError) as ctx:
            validar_imagem_upload(arquivo_grande)
        self.assertIn("5 MB", str(ctx.exception))

    def test_rejeita_extensoes_nao_permitidas(self):
        for nome in ("script.svg", "animado.gif", "virus.exe", "doc.pdf", "sem_extensao"):
            with self.subTest(nome=nome):
                arquivo = SimpleUploadedFile(nome, b"conteudo-qualquer", content_type="application/octet-stream")
                with self.assertRaises(ValidationError) as ctx:
                    validar_imagem_upload(arquivo)
                self.assertIn("não permitido", str(ctx.exception))

    def test_rejeita_conteudo_binario_invalido_mesmo_com_extensao_png(self):
        falso = SimpleUploadedFile("falso.png", b"nao-eh-uma-imagem-real", content_type="image/png")
        with self.assertRaises(ValidationError) as ctx:
            validar_imagem_upload(falso)
        self.assertIn("imagem válida", str(ctx.exception))


class ContentSecurityPolicyMiddlewareUnitTests(SimpleTestCase):
    """Testa diretamente o middleware CSP usando `APIRequestFactory` do DRF."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_aplica_politica_padrao_em_rotas_comuns(self):
        middleware = ContentSecurityPolicyMiddleware(lambda req: HttpResponse("ok"))
        request = self.factory.get("/")
        response = middleware(request)

        self.assertEqual(
            response["Content-Security-Policy"],
            ContentSecurityPolicyMiddleware.POLICY_DEFAULT,
        )
        self.assertIn("script-src 'self'", response["Content-Security-Policy"])
        self.assertIn("frame-ancestors 'none'", response["Content-Security-Policy"])

    def test_aplica_politica_swagger_em_api_docs(self):
        middleware = ContentSecurityPolicyMiddleware(lambda req: HttpResponse("docs"))
        request = self.factory.get("/api/docs/")
        response = middleware(request)

        self.assertEqual(
            response["Content-Security-Policy"],
            ContentSecurityPolicyMiddleware.POLICY_SWAGGER,
        )
        self.assertIn("https://cdn.jsdelivr.net", response["Content-Security-Policy"])

    def test_nao_sobrescreve_header_csp_ja_definido(self):
        def view_com_csp(_req):
            resp = HttpResponse("custom")
            resp["Content-Security-Policy"] = "default-src 'none';"
            return resp

        middleware = ContentSecurityPolicyMiddleware(view_com_csp)
        response = middleware(self.factory.get("/qualquer/"))
        self.assertEqual(response["Content-Security-Policy"], "default-src 'none';")


class ConfigViewsUnitTests(SimpleTestCase):
    """Testa isoladamente as views utilitárias de `config/urls.py` via `APIRequestFactory`."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_health_view_retorna_200_quando_banco_responde(self):
        with mock.patch("django.db.connection.ensure_connection", return_value=None):
            resp = health_view(self.factory.get("/api/health/"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(json.loads(resp.content), {"status": "ok", "db": True})

    def test_health_view_retorna_503_quando_banco_falha(self):
        with mock.patch("django.db.connection.ensure_connection", side_effect=RuntimeError("DB offline")):
            resp = health_view(self.factory.get("/api/health/"))
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(json.loads(resp.content), {"status": "degraded", "db": False})

    @override_settings(TAXA_ENTREGA_PADRAO="-12.50", SHOW_DEMO_SHORTCUTS=False)
    def test_config_publica_sanitiza_taxa_negativa_e_oculta_contas_demo(self):
        resp = config_publica_view(self.factory.get("/api/config/"))
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.content)
        self.assertFalse(data["demo"])
        self.assertEqual(data["taxa_entrega_padrao"], "0.00")
        self.assertNotIn("demo_accounts", data)

    @override_settings(TAXA_ENTREGA_PADRAO="6.50", SHOW_DEMO_SHORTCUTS=True)
    def test_config_publica_expoe_contas_demo_quando_habilitado(self):
        resp = config_publica_view(self.factory.get("/api/config/"))
        data = json.loads(resp.content)
        self.assertTrue(data["demo"])
        self.assertEqual(data["taxa_entrega_padrao"], "6.50")
        self.assertEqual(len(data["demo_accounts"]), 4)

    def test_frontend_assets_e_media_serve_bloqueiam_path_traversal_e_inexistente(self):
        req = self.factory.get("/assets/x")
        with self.assertRaises(Http404):
            frontend_assets_view(req, "../../manage.py")
        with self.assertRaises(Http404):
            frontend_assets_view(req, "arquivo_que_nao_existe.png")

        with tempfile.TemporaryDirectory() as tmpdir:
            media_root = Path(tmpdir)
            arquivo = media_root / "teste.txt"
            arquivo.write_text("conteudo", encoding="utf-8")

            with override_settings(MEDIA_ROOT=media_root):
                with self.assertRaises(Http404):
                    media_serve_view(req, "../../manage.py")
                with self.assertRaises(Http404):
                    media_serve_view(req, "inexistente.png")

                resp = media_serve_view(req, "teste.txt")
                try:
                    self.assertEqual(resp.status_code, 200)
                    self.assertEqual(resp["Cache-Control"], "public, max-age=86400")
                finally:
                    resp.close()
