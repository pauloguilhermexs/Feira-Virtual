"""Testes de unidade do app `avaliacoes` (serializers DRF e regras de validação)."""
from decimal import Decimal
from types import SimpleNamespace

from django.test import TestCase
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.test import APIRequestFactory

from avaliacoes.models import Avaliacao, AvaliacaoCliente
from avaliacoes.serializers import AvaliacaoClienteSerializer, AvaliacaoSerializer, ReclamacaoSerializer
from catalogo.models import Categoria, Produto
from pedidos.models import ItemPedido, Pedido
from usuarios.models import PerfilProdutor, Usuario


class AvaliacoesSerializersUnitTests(TestCase):
    """Testa isoladamente `AvaliacaoSerializer`, `ReclamacaoSerializer` e `AvaliacaoClienteSerializer`."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.cliente = Usuario.objects.create(
            username="cli_av_u", email="cli_av_u@ex.com", password="!", first_name="Carla", last_name="Dias", tipo=Usuario.Tipo.CLIENTE
        )
        self.outro_cli = Usuario.objects.create(
            username="cli2_av_u", email="cli2_av_u@ex.com", password="!", tipo=Usuario.Tipo.CLIENTE
        )
        self.prod_user = Usuario.objects.create(
            username="prod_av_u", email="prod_av_u@ex.com", password="!", tipo=Usuario.Tipo.PRODUTOR
        )
        self.outro_prod_user = Usuario.objects.create(
            username="prod2_av_u", email="prod2_av_u@ex.com", password="!", tipo=Usuario.Tipo.PRODUTOR
        )
        self.perfil = PerfilProdutor.objects.create(
            usuario=self.prod_user, nome_propriedade="Sítio Flor", status=PerfilProdutor.Status.APROVADO
        )
        self.outro_perfil = PerfilProdutor.objects.create(
            usuario=self.outro_prod_user, nome_propriedade="Sítio Norte", status=PerfilProdutor.Status.APROVADO
        )
        self.cat = Categoria.objects.create(nome="Frutas Av Unit", ativa=True)
        self.produto = Produto.objects.create(
            produtor=self.perfil,
            categoria=self.cat,
            nome="Mamão",
            preco=Decimal("7.00"),
            estoque=Decimal("10"),
            unidade_medida=Produto.Unidade.UNIDADE,
        )
        self.outro_produto = Produto.objects.create(
            produtor=self.outro_perfil,
            categoria=self.cat,
            nome="Banana",
            preco=Decimal("5.00"),
            estoque=Decimal("10"),
            unidade_medida=Produto.Unidade.KG,
        )
        self.pedido_concluido = Pedido.objects.create(
            cliente=self.cliente,
            produtor=self.perfil,
            modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO,
            status=Pedido.Status.CONCLUIDO,
            total=Decimal("7.00"),
        )
        ItemPedido.objects.create(
            pedido=self.pedido_concluido,
            produto=self.produto,
            nome_produto=self.produto.nome,
            unidade_medida=self.produto.unidade_medida,
            preco_unitario=self.produto.preco,
            quantidade=Decimal("1"),
        )

    def _req(self, user):
        req = self.factory.post("/api/avaliacoes/")
        req.user = user
        return req

    def test_campos_calculados_e_trava_de_campos_na_edicao(self):
        ser = AvaliacaoSerializer()
        self.assertEqual(ser.get_tipo_avaliacao(SimpleNamespace(produto_id=5)), "PRODUTO")
        self.assertEqual(ser.get_tipo_avaliacao(SimpleNamespace(produto_id=None)), "PRODUTOR")

        c_full = SimpleNamespace(get_full_name=lambda: "Carla Dias", first_name="Carla", username="cdias")
        c_first = SimpleNamespace(get_full_name=lambda: "", first_name="Lucas", username="lucas1")
        c_user = SimpleNamespace(get_full_name=lambda: "", first_name="", username="anon_u")
        self.assertEqual(ser.get_cliente_nome(SimpleNamespace(cliente=c_full)), "Carla Dias")
        self.assertEqual(ser.get_cliente_nome(SimpleNamespace(cliente=c_first)), "Lucas")
        self.assertEqual(ser.get_cliente_nome(SimpleNamespace(cliente=c_user)), "anon_u")

        # Na criação campos são editáveis; na edição ficam read_only
        campos_criacao = AvaliacaoSerializer().get_fields()
        self.assertFalse(campos_criacao["produto"].read_only)
        self.assertFalse(campos_criacao["produtor"].read_only)
        self.assertFalse(campos_criacao["pedido"].read_only)

        av = Avaliacao.objects.create(
            cliente=self.cliente, pedido=self.pedido_concluido, produto=self.produto, nota=5
        )
        campos_edicao = AvaliacaoSerializer(instance=av).get_fields()
        self.assertTrue(campos_edicao["produto"].read_only)
        self.assertTrue(campos_edicao["produtor"].read_only)
        self.assertTrue(campos_edicao["pedido"].read_only)

    def test_validate_exige_produto_xor_produtor_e_faixa_de_nota(self):
        ctx = {"request": self._req(self.cliente)}

        # Nem produto nem produtor
        s_nenhum = AvaliacaoSerializer(data={"nota": 5}, context=ctx)
        self.assertFalse(s_nenhum.is_valid())
        self.assertIn("apenas um", str(s_nenhum.errors).lower())

        # Ambos preenchidos simultaneamente
        s_ambos = AvaliacaoSerializer(
            data={"produto": self.produto.id, "produtor": self.perfil.id, "nota": 5},
            context=ctx,
        )
        self.assertFalse(s_ambos.is_valid())
        self.assertIn("apenas um", str(s_ambos.errors).lower())

        # Notas fora do intervalo 1..5
        for nota_invalida in (0, 6):
            s_nota = AvaliacaoSerializer(data={"produto": self.produto.id, "nota": nota_invalida}, context=ctx)
            self.assertFalse(s_nota.is_valid())
            self.assertIn("nota", s_nota.errors)

    def test_validate_rejeita_item_ou_produtor_alheio_ao_pedido_e_vincula_pedido_elegivel(self):
        ctx = {"request": self._req(self.cliente)}

        # Produto que não faz parte do pedido informado
        s_prod_errado = AvaliacaoSerializer(
            data={"pedido": self.pedido_concluido.id, "produto": self.outro_produto.id, "nota": 4},
            context=ctx,
        )
        self.assertFalse(s_prod_errado.is_valid())
        self.assertIn("não pertence ao pedido", str(s_prod_errado.errors).lower())

        # Produtor que não faz parte do pedido informado
        s_perf_errado = AvaliacaoSerializer(
            data={"pedido": self.pedido_concluido.id, "produtor": self.outro_perfil.id, "nota": 4},
            context=ctx,
        )
        self.assertFalse(s_perf_errado.is_valid())
        self.assertIn("não pertence ao pedido", str(s_perf_errado.errors).lower())

        # Sem passar `pedido`, vincula automaticamente ao pedido concluído elegível
        s_auto = AvaliacaoSerializer(data={"produtor": self.perfil.id, "nota": 5}, context=ctx)
        self.assertTrue(s_auto.is_valid(), s_auto.errors)
        self.assertEqual(s_auto.validated_data["pedido"], self.pedido_concluido)
        s_auto.save(cliente=self.cliente)

        # Segunda tentativa sem passar `pedido` é bloqueada por já avaliado
        s_dup = AvaliacaoSerializer(data={"produtor": self.perfil.id, "nota": 4}, context=ctx)
        self.assertFalse(s_dup.is_valid())
        self.assertIn("já avaliou", str(s_dup.errors).lower())

    def test_reclamacao_serializer_valida_titularidade_do_pedido(self):
        s_alheio = ReclamacaoSerializer(
            data={"pedido": self.pedido_concluido.id, "assunto": "Atraso", "descricao": "Teste"},
            context={"request": self._req(self.outro_cli)},
        )
        self.assertFalse(s_alheio.is_valid())
        self.assertIn("pedido", s_alheio.errors)

        s_ok = ReclamacaoSerializer(
            data={"pedido": self.pedido_concluido.id, "assunto": "Embalagem", "descricao": "Veio aberta"},
            context={"request": self._req(self.cliente)},
        )
        self.assertTrue(s_ok.is_valid(), s_ok.errors)

    def test_avaliacao_cliente_serializer_valida_produtor_status_e_duplicidade(self):
        ped_pendente = Pedido.objects.create(
            cliente=self.cliente,
            produtor=self.perfil,
            modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO,
            status=Pedido.Status.PENDENTE,
            total=Decimal("7.00"),
        )

        # Usuário sem perfil_produtor falha
        s_sem_perfil = AvaliacaoClienteSerializer(
            data={"pedido": self.pedido_concluido.id, "nota": 5},
            context={"request": self._req(self.cliente)},
        )
        self.assertFalse(s_sem_perfil.is_valid())
        self.assertIn("pedido", s_sem_perfil.errors)

        # Outro produtor falha
        s_outro_prod = AvaliacaoClienteSerializer(
            data={"pedido": self.pedido_concluido.id, "nota": 5},
            context={"request": self._req(self.outro_prod_user)},
        )
        self.assertFalse(s_outro_prod.is_valid())

        # Pedido não concluído falha
        s_pend = AvaliacaoClienteSerializer(
            data={"pedido": ped_pendente.id, "nota": 5},
            context={"request": self._req(self.prod_user)},
        )
        self.assertFalse(s_pend.is_valid())
        self.assertIn("conclusão", str(s_pend.errors).lower())

        # Válido salva e bloqueia duplicidade
        s_ok = AvaliacaoClienteSerializer(
            data={"pedido": self.pedido_concluido.id, "nota": 5, "comentario": "Ótimo cliente"},
            context={"request": self._req(self.prod_user)},
        )
        self.assertTrue(s_ok.is_valid(), s_ok.errors)
        av_cli = s_ok.save(produtor=self.perfil, cliente=self.cliente)
        self.assertEqual(AvaliacaoClienteSerializer().get_cliente_nome(av_cli), "Carla Dias")

        s_dup = AvaliacaoClienteSerializer(
            data={"pedido": self.pedido_concluido.id, "nota": 4},
            context={"request": self._req(self.prod_user)},
        )
        self.assertFalse(s_dup.is_valid())
        self.assertIn("pedido", s_dup.errors)
        with self.assertRaises(DRFValidationError) as ctx_dup:
            s_dup.validate_pedido(self.pedido_concluido)
        self.assertIn("já avaliou", str(ctx_dup.exception).lower())
        self.assertEqual(AvaliacaoCliente.objects.count(), 1)
