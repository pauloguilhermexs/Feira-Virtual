"""Testes de unidade do app `usuarios` (permissões DRF, helpers, modelos e serializers)."""
from io import BytesIO
from types import SimpleNamespace

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from PIL import Image
from rest_framework.test import APIRequestFactory

from usuarios.models import Endereco, PerfilEntregador, PerfilProdutor, Usuario
from usuarios.permissions import AdminEscreveTodosLeem, EhAdmin, EhCliente, EhEntregador, EhProdutor
from usuarios.serializers import (
    PerfilProdutorSerializer,
    RegistroClienteSerializer,
    RegistroEntregadorSerializer,
    RegistroProdutorSerializer,
    UsuarioSerializer,
)
from usuarios.views import _obter_ip


def _usuario_fake(tipo, autenticado=True):
    return SimpleNamespace(is_authenticated=autenticado, tipo=tipo)


class PermissoesDRFUnitTests(SimpleTestCase):
    """Testa isoladamente todas as classes de permissão RBAC do DRF sem tocar no banco."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_permissoes_por_tipo_autorizam_apenas_perfil_correspondente(self):
        classes = [
            (EhCliente(), "CLIENTE"),
            (EhProdutor(), "PRODUTOR"),
            (EhEntregador(), "ENTREGADOR"),
            (EhAdmin(), "ADMIN"),
        ]
        tipos = ("CLIENTE", "PRODUTOR", "ENTREGADOR", "ADMIN")

        for perm, tipo_esperado in classes:
            for tipo_atual in tipos:
                with self.subTest(permissao=perm.__class__.__name__, tipo=tipo_atual):
                    req = self.factory.get("/api/teste/")
                    req.user = _usuario_fake(tipo_atual)
                    self.assertEqual(perm.has_permission(req, None), tipo_atual == tipo_esperado)

    def test_permissoes_por_tipo_bloqueiam_anonimo_e_user_none(self):
        for perm in (EhCliente(), EhProdutor(), EhEntregador(), EhAdmin()):
            req_none = self.factory.get("/api/teste/")
            req_none.user = None
            self.assertFalse(perm.has_permission(req_none, None))

            req_anon = self.factory.get("/api/teste/")
            req_anon.user = _usuario_fake("ADMIN", autenticado=False)
            self.assertFalse(perm.has_permission(req_anon, None))

    def test_admin_escreve_todos_leem_respeita_safe_methods_e_escrita_admin(self):
        perm = AdminEscreveTodosLeem()

        # Métodos seguros (GET, HEAD, OPTIONS) são públicos
        for metodo in ("get", "head", "options"):
            req = getattr(self.factory, metodo)("/api/categorias/")
            req.user = _usuario_fake("CLIENTE", autenticado=False)
            self.assertTrue(perm.has_permission(req, None))

        # Métodos de escrita exigem ADMIN autenticado
        for metodo in ("post", "patch", "delete"):
            req_admin = getattr(self.factory, metodo)("/api/categorias/")
            req_admin.user = _usuario_fake("ADMIN", autenticado=True)
            self.assertTrue(perm.has_permission(req_admin, None))

            for perfil in ("CLIENTE", "PRODUTOR", "ENTREGADOR"):
                req_nao_admin = getattr(self.factory, metodo)("/api/categorias/")
                req_nao_admin.user = _usuario_fake(perfil, autenticado=True)
                self.assertFalse(perm.has_permission(req_nao_admin, None))

            req_anon = getattr(self.factory, metodo)("/api/categorias/")
            req_anon.user = _usuario_fake("ADMIN", autenticado=False)
            self.assertFalse(perm.has_permission(req_anon, None))


class ObterIpEEnderecoUnitTests(SimpleTestCase):
    """Testa funções puras de extração de IP e formatação textual de endereço."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_obter_ip_prioriza_primeiro_ip_de_x_forwarded_for(self):
        req = self.factory.get(
            "/api/perfil/",
            HTTP_X_FORWARDED_FOR="203.0.113.10, 10.0.0.1, 172.16.0.2",
            REMOTE_ADDR="127.0.0.1",
        )
        self.assertEqual(_obter_ip(req), "203.0.113.10")

    def test_obter_ip_faz_fallback_para_remote_addr(self):
        req = self.factory.get("/api/perfil/", REMOTE_ADDR="192.168.0.42")
        self.assertEqual(_obter_ip(req), "192.168.0.42")

    def test_endereco_como_texto_e_str_formatam_com_e_sem_complemento_e_cep(self):
        end_completo = Endereco(
            logradouro="Av. Roberto Freire",
            numero="1200",
            complemento="Apto 302",
            bairro="Ponta Negra",
            cidade="Natal",
            estado="RN",
            cep="59090-000",
        )
        esperado = "Av. Roberto Freire, 1200, Apto 302 - Ponta Negra, Natal/RN 59090-000"
        self.assertEqual(end_completo.como_texto(), esperado)
        self.assertEqual(str(end_completo), esperado)

        end_sem_comp_sem_cep = Endereco(
            logradouro="Rua das Flores",
            numero="42",
            complemento="",
            bairro="Tirol",
            cidade="Natal",
            estado="RN",
            cep="",
        )
        self.assertEqual(end_sem_comp_sem_cep.como_texto(), "Rua das Flores, 42 - Tirol, Natal/RN")


class UsuariosModelsESerializersUnitTests(TestCase):
    """Testa regras de persistência do modelo `Usuario` e serializers DRF do app."""

    def test_usuario_superuser_forca_tipo_admin_e_str(self):
        user = Usuario.objects.create(
            username="root_unit",
            email="root_unit@ex.com",
            password="!",
            tipo=Usuario.Tipo.CLIENTE,
            is_superuser=True,
            is_staff=True,
        )
        user.refresh_from_db()
        self.assertEqual(user.tipo, Usuario.Tipo.ADMIN)
        self.assertEqual(str(user), "root_unit (ADMIN)")

    def test_usuario_serializer_protege_username_e_tipo_como_read_only(self):
        user = Usuario.objects.create(
            username="ana_cli",
            email="ana@ex.com",
            password="!",
            first_name="Ana",
            tipo=Usuario.Tipo.CLIENTE,
        )
        serializer = UsuarioSerializer(
            instance=user,
            data={"username": "hacker", "tipo": Usuario.Tipo.ADMIN, "first_name": "Ana Clara"},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        atualizado = serializer.save()

        self.assertEqual(atualizado.first_name, "Ana Clara")
        self.assertEqual(atualizado.username, "ana_cli")
        self.assertEqual(atualizado.tipo, Usuario.Tipo.CLIENTE)

    def test_perfil_produtor_serializer_protege_status_e_valida_foto(self):
        user = Usuario.objects.create(
            username="prod_unit",
            email="prod_unit@ex.com",
            password="!",
            tipo=Usuario.Tipo.PRODUTOR,
        )
        perfil = PerfilProdutor.objects.create(
            usuario=user,
            nome_propriedade="Sítio Seridó",
            status=PerfilProdutor.Status.PENDENTE,
        )

        # Tentativa de auto-aprovar status deve ser ignorada por read_only_fields
        ser_status = PerfilProdutorSerializer(
            instance=perfil,
            data={"status": PerfilProdutor.Status.APROVADO, "descricao": "Agricultura familiar"},
            partial=True,
        )
        self.assertTrue(ser_status.is_valid(), ser_status.errors)
        ser_status.save()
        perfil.refresh_from_db()
        self.assertEqual(perfil.status, PerfilProdutor.Status.PENDENTE)
        self.assertEqual(perfil.descricao, "Agricultura familiar")

        # validate_foto_propriedade rejeita arquivo falso e aceita PNG válido
        falso = SimpleUploadedFile("falso.png", b"nao-imagem", content_type="image/png")
        with self.assertRaises(DjangoValidationError):
            PerfilProdutorSerializer().validate_foto_propriedade(falso)

        buf = BytesIO()
        Image.new("RGB", (16, 16), color=(0, 128, 0)).save(buf, format="PNG")
        valido = SimpleUploadedFile("sitio.png", buf.getvalue(), content_type="image/png")
        self.assertIs(PerfilProdutorSerializer().validate_foto_propriedade(valido), valido)
        self.assertIsNone(PerfilProdutorSerializer().validate_foto_propriedade(None))

    def test_registro_base_serializer_valida_forca_da_senha(self):
        ser = RegistroClienteSerializer()
        for senha_fraca in ("123", "12345678", "password"):
            with self.subTest(senha=senha_fraca):
                with self.assertRaises(DjangoValidationError):
                    ser.validate_password(senha_fraca)

        self.assertEqual(ser.validate_password("Senha-Segura-2026!"), "Senha-Segura-2026!")

    def test_registro_produtor_e_entregador_criam_perfis_e_hash_de_senha(self):
        ser_prod = RegistroProdutorSerializer(
            data={
                "username": "prod_reg_unit",
                "email": "prod_reg_unit@ex.com",
                "password": "Senha-Segura-2026!",
                "nome_propriedade": "Chácara Potiguar",
                "cidade": "Mossoró",
                "estado": "RN",
                "chave_pix": "chacara@pix",
            }
        )
        self.assertTrue(ser_prod.is_valid(), ser_prod.errors)
        user_prod = ser_prod.save()
        self.assertEqual(user_prod.tipo, Usuario.Tipo.PRODUTOR)
        self.assertTrue(user_prod.check_password("Senha-Segura-2026!"))
        self.assertEqual(user_prod.perfil_produtor.nome_propriedade, "Chácara Potiguar")
        self.assertEqual(user_prod.perfil_produtor.status, PerfilProdutor.Status.PENDENTE)
        self.assertEqual(str(user_prod.perfil_produtor), "Chácara Potiguar")

        ser_ent = RegistroEntregadorSerializer(
            data={
                "username": "ent_reg_unit",
                "email": "ent_reg_unit@ex.com",
                "password": "Senha-Segura-2026!",
                "veiculo": "Moto CG",
                "placa": "RGN1A23",
                "area_atuacao": "Zona Sul",
            }
        )
        self.assertTrue(ser_ent.is_valid(), ser_ent.errors)
        user_ent = ser_ent.save()
        self.assertEqual(user_ent.tipo, Usuario.Tipo.ENTREGADOR)
        self.assertTrue(PerfilEntregador.objects.filter(usuario=user_ent, veiculo="Moto CG").exists())
