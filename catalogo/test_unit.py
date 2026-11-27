"""Testes de unidade do app `catalogo` (serializers DRF e validações de modelos)."""
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from PIL import Image
from rest_framework import serializers as drf_serializers

from catalogo.models import Categoria, Produto
from catalogo.serializers import ProdutoProdutorSerializer, ProdutorPublicoSerializer
from usuarios.models import PerfilProdutor, Usuario


class ProdutorPublicoSerializerUnitTests(SimpleTestCase):
    """Testa isoladamente os campos calculados e restrições de privacidade de `ProdutorPublicoSerializer`."""

    def test_get_cidade_uf_todas_as_combinacoes(self):
        ser = ProdutorPublicoSerializer()
        casos = [
            ("Natal", "RN", "Natal / RN"),
            ("Parnamirim", "", "Parnamirim"),
            ("", "RN", "RN"),
            ("", "", ""),
            (None, None, ""),
        ]
        for cidade, estado, esperado in casos:
            with self.subTest(cidade=cidade, estado=estado):
                obj = SimpleNamespace(cidade=cidade, estado=estado)
                self.assertEqual(ser.get_cidade_uf(obj), esperado)

    def test_get_aceita_pix_e_chave_pix_nao_exposta(self):
        ser = ProdutorPublicoSerializer()
        self.assertTrue(ser.get_aceita_pix(SimpleNamespace(chave_pix="sitio@pix.com")))
        self.assertFalse(ser.get_aceita_pix(SimpleNamespace(chave_pix="")))
        self.assertFalse(ser.get_aceita_pix(SimpleNamespace(chave_pix="   ")))
        self.assertFalse(ser.get_aceita_pix(SimpleNamespace(chave_pix=None)))
        self.assertNotIn("chave_pix", ProdutorPublicoSerializer.Meta.fields)


class ProdutoCatalogoUnitTests(TestCase):
    """Testa serializers de produtor e regras de validação de `Categoria` e `Produto`."""

    def setUp(self):
        self.user = Usuario.objects.create(
            username="prod_cat_unit",
            email="prod_cat_unit@ex.com",
            password="!",
            tipo=Usuario.Tipo.PRODUTOR,
        )
        self.perfil = PerfilProdutor.objects.create(
            usuario=self.user,
            nome_propriedade="Horta Potiguar",
            status=PerfilProdutor.Status.APROVADO,
        )
        self.cat_ativa = Categoria.objects.create(nome="Verduras Unit", ativa=True)
        self.cat_inativa = Categoria.objects.create(nome="Arquivada Unit", ativa=False)

    def test_validate_categoria_rejeita_inativa_e_aceita_ativa(self):
        ser = ProdutoProdutorSerializer()
        self.assertEqual(ser.validate_categoria(self.cat_ativa), self.cat_ativa)

        with self.assertRaises(drf_serializers.ValidationError) as ctx:
            ser.validate_categoria(self.cat_inativa)
        self.assertIn("inativa", str(ctx.exception).lower())

    def test_validate_imagem_rejeita_arquivo_corrompido_e_aceita_png_valido(self):
        ser = ProdutoProdutorSerializer()
        self.assertIsNone(ser.validate_imagem(None))

        falso = SimpleUploadedFile("corrupto.png", b"lixo-binario", content_type="image/png")
        with self.assertRaises(DjangoValidationError):
            ser.validate_imagem(falso)

        buf = BytesIO()
        Image.new("RGB", (24, 24), color=(103, 174, 37)).save(buf, format="PNG")
        valido = SimpleUploadedFile("alface.png", buf.getvalue(), content_type="image/png")
        self.assertIs(ser.validate_imagem(valido), valido)

    def test_oculto_moderacao_permanece_somente_leitura_no_serializer_do_produtor(self):
        prod = Produto.objects.create(
            produtor=self.perfil,
            categoria=self.cat_ativa,
            nome="Cheiro Verde",
            preco=Decimal("3.00"),
            estoque=Decimal("10.000"),
            ativo=False,
            oculto_moderacao=True,
        )
        ser = ProdutoProdutorSerializer(
            instance=prod,
            data={"ativo": True, "oculto_moderacao": False, "preco": "3.50"},
            partial=True,
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        atualizado = ser.save()
        self.assertTrue(atualizado.oculto_moderacao)
        self.assertEqual(atualizado.preco, Decimal("3.50"))

    def test_str_e_validadores_de_preco_e_estoque_no_modelo_produto(self):
        self.assertEqual(str(self.cat_ativa), "Verduras Unit")

        prod_ok = Produto(
            produtor=self.perfil,
            categoria=self.cat_ativa,
            nome="Tomate Cereja",
            preco=Decimal("0.01"),
            estoque=Decimal("0.000"),
        )
        prod_ok.full_clean()
        self.assertEqual(str(prod_ok), "Tomate Cereja (Horta Potiguar)")

        prod_preco_zero = Produto(
            produtor=self.perfil,
            categoria=self.cat_ativa,
            nome="Grátis Inválido",
            preco=Decimal("0.00"),
            estoque=Decimal("5.000"),
        )
        with self.assertRaises(DjangoValidationError) as ctx_preco:
            prod_preco_zero.full_clean()
        self.assertIn("preco", ctx_preco.exception.message_dict)

        prod_estoque_neg = Produto(
            produtor=self.perfil,
            categoria=self.cat_ativa,
            nome="Estoque Negativo",
            preco=Decimal("5.00"),
            estoque=Decimal("-0.500"),
        )
        with self.assertRaises(DjangoValidationError) as ctx_est:
            prod_estoque_neg.full_clean()
        self.assertIn("estoque", ctx_est.exception.message_dict)
