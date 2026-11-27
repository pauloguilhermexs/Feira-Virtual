"""Testes de unidade do app `painel` (auditoria e serializers administrativos)."""
from datetime import datetime, timezone as dt_timezone

from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIRequestFactory

from painel.models import LogAuditoria
from painel.views import ProdutoAdminSerializer, ProdutorAdminSerializer, registrar_auditoria
from usuarios.models import Usuario


class PainelAuditoriaUnitTests(TestCase):
    """Testa isoladamente `registrar_auditoria` e a representação de `LogAuditoria`."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = Usuario.objects.create(
            username="adm_pnl_u", email="adm_pnl_u@ex.com", password="!", is_superuser=True, is_staff=True
        )

    def test_log_auditoria_str_formata_data_acao_e_descricao(self):
        log = LogAuditoria(
            acao=LogAuditoria.Acao.APROVAR_PRODUTOR,
            descricao="Produtor #4 aprovado",
            criado_em=datetime(2026, 6, 15, 10, 45, tzinfo=dt_timezone.utc),
        )
        self.assertEqual(str(log), "[2026-06-15 10:45] APROVAR_PRODUTOR: Produtor #4 aprovado")

    def test_registrar_auditoria_extrai_ip_forwarded_for_remote_addr_e_trunca_descricao(self):
        # 1) Prioriza primeiro IP em HTTP_X_FORWARDED_FOR
        req_proxy = self.factory.post(
            "/api/admin/teste/",
            HTTP_X_FORWARDED_FOR="198.51.100.7, 10.0.0.2",
            REMOTE_ADDR="127.0.0.1",
        )
        req_proxy.user = self.admin
        registrar_auditoria(req_proxy, LogAuditoria.Acao.BLOQUEAR_USUARIO, "Usuário bloqueado via proxy")

        log_proxy = LogAuditoria.objects.get(acao=LogAuditoria.Acao.BLOQUEAR_USUARIO)
        self.assertEqual(log_proxy.usuario, self.admin)
        self.assertEqual(log_proxy.ip, "198.51.100.7")

        # 2) Fallback para REMOTE_ADDR e truncamento seguro em 255 caracteres
        req_direto = self.factory.post("/api/admin/teste/", REMOTE_ADDR="127.0.0.1")
        req_direto.user = self.admin
        descricao_longa = "X" * 320
        registrar_auditoria(req_direto, LogAuditoria.Acao.MODERAR_RECLAMACAO, descricao_longa)

        log_direto = LogAuditoria.objects.get(acao=LogAuditoria.Acao.MODERAR_RECLAMACAO)
        self.assertEqual(log_direto.ip, "127.0.0.1")
        self.assertEqual(len(log_direto.descricao), 255)


class PainelSerializersUnitTests(SimpleTestCase):
    """Testa isoladamente o contrato de campos dos serializers administrativos."""

    def test_produto_admin_serializer_permite_editar_oculto_moderacao_e_protege_vinculos(self):
        campos = ProdutoAdminSerializer().get_fields()
        self.assertFalse(campos["oculto_moderacao"].read_only)
        self.assertTrue(campos["produtor"].read_only)
        self.assertTrue(campos["criado_em"].read_only)
        self.assertTrue(campos["excluido_em"].read_only)

    def test_produtor_admin_serializer_expoe_metricas_e_protege_status(self):
        campos = ProdutorAdminSerializer().get_fields()
        self.assertTrue(campos["status"].read_only)
        for campo_admin in ("usuario_username", "usuario_email", "total_produtos", "total_pedidos", "total_avaliacoes"):
            self.assertIn(campo_admin, campos)
            self.assertTrue(campos[campo_admin].read_only)
