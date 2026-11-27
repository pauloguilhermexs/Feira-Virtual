"""Testes de unidade do app `pedidos` (modelos, serializers DRF, services, Pix e notificações)."""
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
import hashlib
import hmac
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.test import APIRequestFactory

from catalogo.models import Categoria, Produto
from pedidos.models import Carrinho, HistoricoStatus, ItemCarrinho, ItemPedido, Pedido, gerar_numero_publico
from pedidos.notificacoes import (
    CentralNotificacoes,
    NotificadorBase,
    NotificadorEmail,
    NotificadorWhatsApp,
)
from pedidos.pix import DEFAULT_DEV_SECRET, GatewayPixBase, MockPixGateway, obter_gateway_pix
from pedidos.serializers import (
    UNIDADES_INTEIRAS,
    CheckoutSerializer,
    ItemCarrinhoSerializer,
    PedidoSerializer,
    _resumir_endereco_entregador,
)
from pedidos.services import finalizar_carrinho, mudar_status, validar_pagamento
from usuarios.models import Endereco, PerfilProdutor, Usuario


class PedidosModelsPureUnitTests(SimpleTestCase):
    """Testa funções puras e propriedades matemáticas dos modelos de pedidos sem banco."""

    def test_gerar_numero_publico_segue_padrao_e_varia(self):
        codigos = [gerar_numero_publico() for _ in range(30)]
        for codigo in codigos:
            self.assertRegex(codigo, r"^PED-[A-Z0-9]{8}$")
        self.assertGreater(len(set(codigos)), 1)

    def test_pedido_total_com_frete_soma_e_arredonda(self):
        p1 = Pedido(total=Decimal("17.50"), taxa_entrega=Decimal("5.25"))
        self.assertEqual(p1.total_com_frete, Decimal("22.75"))

        p_sem_frete = Pedido(total=Decimal("10.00"), taxa_entrega=None)
        self.assertEqual(p_sem_frete.total_com_frete, Decimal("10.00"))

        p_vazio = Pedido(total=None, taxa_entrega=None)
        self.assertEqual(p_vazio.total_com_frete, Decimal("0.00"))

    def test_subtotais_de_item_carrinho_e_item_pedido_arredondam_para_duas_casas(self):
        prod = Produto(preco=Decimal("7.90"))
        item_c = ItemCarrinho(produto=prod, quantidade=Decimal("1.333"))
        self.assertEqual(item_c.subtotal, Decimal("10.53"))

        item_p = ItemPedido(preco_unitario=Decimal("7.90"), quantidade=Decimal("1.333"))
        self.assertEqual(item_p.subtotal, Decimal("10.53"))


class ResumirEnderecoEPedidoSerializerUnitTests(SimpleTestCase):
    """Testa mascaramento de endereço, LGPD na chave Pix e campos derivados de `PedidoSerializer`."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def test_resumir_endereco_entregador_formatos_e_casos_limite(self):
        self.assertEqual(_resumir_endereco_entregador(""), "")
        self.assertEqual(
            _resumir_endereco_entregador("Rua A, 10 - Lagoa Nova, Natal/RN 59064-000"),
            "Lagoa Nova, Natal/RN",
        )
        self.assertEqual(
            _resumir_endereco_entregador("Rua B, 20, Bloco C - Tirol, Natal/RN 59015000"),
            "Tirol, Natal/RN",
        )
        self.assertEqual(
            _resumir_endereco_entregador("Av. Sem Separador 100 Natal"),
            "Endereço disponível após aceitar a entrega",
        )

    def test_get_chave_pix_respeita_lgpd_por_papel_e_status(self):
        pedido_ativo = SimpleNamespace(
            cliente_id=10,
            status=Pedido.Status.PENDENTE,
            produtor=SimpleNamespace(chave_pix="sitio@pix.com"),
        )
        pedido_cancelado = SimpleNamespace(
            cliente_id=10,
            status=Pedido.Status.CANCELADO,
            produtor=SimpleNamespace(chave_pix="sitio@pix.com"),
        )
        pedido_recusado = SimpleNamespace(
            cliente_id=10,
            status=Pedido.Status.RECUSADO,
            produtor=SimpleNamespace(chave_pix="sitio@pix.com"),
        )

        # Sem request ou anônimo -> None
        self.assertIsNone(PedidoSerializer().get_chave_pix(pedido_ativo))
        req_anon = self.factory.get("/")
        req_anon.user = SimpleNamespace(is_authenticated=False, id=10, tipo="CLIENTE")
        self.assertIsNone(PedidoSerializer(context={"request": req_anon}).get_chave_pix(pedido_ativo))

        # Cliente titular, produtor e admin veem em pedido ativo
        for uid, tipo in ((10, "CLIENTE"), (20, "PRODUTOR"), (1, "ADMIN")):
            req = self.factory.get("/")
            req.user = SimpleNamespace(is_authenticated=True, id=uid, tipo=tipo)
            ser = PedidoSerializer(context={"request": req})
            self.assertEqual(ser.get_chave_pix(pedido_ativo), "sitio@pix.com")
            self.assertIsNone(ser.get_chave_pix(pedido_cancelado))
            self.assertIsNone(ser.get_chave_pix(pedido_recusado))

        # Outro cliente e entregador nunca veem a chave Pix
        for uid, tipo in ((99, "CLIENTE"), (30, "ENTREGADOR")):
            req = self.factory.get("/")
            req.user = SimpleNamespace(is_authenticated=True, id=uid, tipo=tipo)
            self.assertIsNone(PedidoSerializer(context={"request": req}).get_chave_pix(pedido_ativo))

    def test_get_endereco_entrega_mascara_para_entregador_nao_atribuido(self):
        end_full = "Rua das Flores, 42 - Lagoa Nova, Natal/RN 59064-000"
        pedido = SimpleNamespace(entregador_id=30, endereco_entrega=end_full)

        req_outro_ent = self.factory.get("/")
        req_outro_ent.user = SimpleNamespace(is_authenticated=True, id=31, tipo="ENTREGADOR")
        self.assertEqual(
            PedidoSerializer(context={"request": req_outro_ent}).get_endereco_entrega(pedido),
            "Lagoa Nova, Natal/RN",
        )

        req_atribuido = self.factory.get("/")
        req_atribuido.user = SimpleNamespace(is_authenticated=True, id=30, tipo="ENTREGADOR")
        self.assertEqual(
            PedidoSerializer(context={"request": req_atribuido}).get_endereco_entrega(pedido),
            end_full,
        )

        req_cliente = self.factory.get("/")
        req_cliente.user = SimpleNamespace(is_authenticated=True, id=10, tipo="CLIENTE")
        self.assertEqual(
            PedidoSerializer(context={"request": req_cliente}).get_endereco_entrega(pedido),
            end_full,
        )

    def test_get_local_retirada_e_get_cliente_nome_fallbacks(self):
        ser = PedidoSerializer()

        p_completo = SimpleNamespace(
            produtor=SimpleNamespace(
                endereco_propriedade="Estrada Rural km 4",
                cidade="Macaíba",
                estado="RN",
                nome_propriedade="Sítio Boa Vista",
            )
        )
        self.assertEqual(ser.get_local_retirada(p_completo), "Estrada Rural km 4 - Macaíba/RN")

        p_sem_end = SimpleNamespace(
            produtor=SimpleNamespace(
                endereco_propriedade="",
                cidade="",
                estado="",
                nome_propriedade="Sítio Fallback",
            )
        )
        self.assertEqual(ser.get_local_retirada(p_sem_end), "Sítio Fallback")

        # Prioridade de nome: full_name -> first_name -> username
        cli_full = SimpleNamespace(get_full_name=lambda: "Maria Silva", first_name="Maria", username="msilva")
        cli_first = SimpleNamespace(get_full_name=lambda: "   ", first_name="João", username="joao1")
        cli_user = SimpleNamespace(get_full_name=lambda: "", first_name="", username="user_x")
        self.assertEqual(ser.get_cliente_nome(SimpleNamespace(cliente=cli_full)), "Maria Silva")
        self.assertEqual(ser.get_cliente_nome(SimpleNamespace(cliente=cli_first)), "João")
        self.assertEqual(ser.get_cliente_nome(SimpleNamespace(cliente=cli_user)), "user_x")

    def test_get_concluido_em_avaliacoes_feitas_e_cliente_avaliado(self):
        ser = PedidoSerializer()
        t_conc = datetime(2026, 5, 10, 14, 30, tzinfo=dt_timezone.utc)
        t_upd = datetime(2026, 5, 10, 15, 0, tzinfo=dt_timezone.utc)

        # Pedido em andamento -> None e dicionário vazio
        p_aberto = SimpleNamespace(
            status=Pedido.Status.PRONTO,
            produtor_id=7,
            historico=SimpleNamespace(all=lambda: []),
            avaliacoes=SimpleNamespace(all=lambda: []),
            atualizado_em=t_upd,
        )
        self.assertIsNone(ser.get_concluido_em(p_aberto))
        self.assertEqual(ser.get_avaliacoes_feitas(p_aberto), {"produtor": False, "produtos": []})
        self.assertFalse(ser.get_cliente_avaliado(p_aberto))

        # Pedido concluído com histórico e avaliações
        p_conc = SimpleNamespace(
            status=Pedido.Status.CONCLUIDO,
            produtor_id=7,
            historico=SimpleNamespace(
                all=lambda: [
                    SimpleNamespace(status=Pedido.Status.PENDENTE, criado_em=t_upd),
                    SimpleNamespace(status=Pedido.Status.CONCLUIDO, criado_em=t_conc),
                ]
            ),
            avaliacoes=SimpleNamespace(
                all=lambda: [
                    SimpleNamespace(produtor_id=7, produto_id=None),
                    SimpleNamespace(produtor_id=None, produto_id=42),
                ]
            ),
            avaliacao_cliente=SimpleNamespace(id=1),
            atualizado_em=t_upd,
        )
        self.assertEqual(ser.get_concluido_em(p_conc), t_conc)
        self.assertEqual(ser.get_avaliacoes_feitas(p_conc), {"produtor": True, "produtos": [42]})
        self.assertTrue(ser.get_cliente_avaliado(p_conc))

        # Concluído sem entrada no histórico faz fallback para atualizado_em
        p_sem_hist = SimpleNamespace(
            status=Pedido.Status.CONCLUIDO,
            historico=SimpleNamespace(all=lambda: []),
            atualizado_em=t_upd,
        )
        self.assertEqual(ser.get_concluido_em(p_sem_hist), t_upd)


class ValidarPagamentoUnitTests(SimpleTestCase):
    """Testa isoladamente todas as combinações de `pedidos.services.validar_pagamento`."""

    def test_validar_pagamento_todas_combinacoes(self):
        completo = SimpleNamespace(
            nome_propriedade="Sítio Completo",
            chave_pix="sitio@pix",
            possui_maquininha=True,
            aceita_dinheiro=True,
        )
        restrito = SimpleNamespace(
            nome_propriedade="Sítio Restrito",
            chave_pix="",
            possui_maquininha=False,
            aceita_dinheiro=False,
        )

        # Todas as formas aceitas no produtor completo não levantam erro
        for forma in Pedido.FormaPagamento.values:
            validar_pagamento(completo, forma)

        # Todas as formas bloqueadas no produtor restrito levantam ValidationError clara
        with self.assertRaises(DRFValidationError) as c_pix:
            validar_pagamento(restrito, Pedido.FormaPagamento.PIX)
        self.assertIn("Pix", str(c_pix.exception))

        with self.assertRaises(DRFValidationError) as c_cartao:
            validar_pagamento(restrito, Pedido.FormaPagamento.CARTAO)
        self.assertIn("maquininha", str(c_cartao.exception))

        with self.assertRaises(DRFValidationError) as c_din:
            validar_pagamento(restrito, Pedido.FormaPagamento.DINHEIRO)
        self.assertIn("dinheiro", str(c_din.exception))


class PixGatewayUnitTests(SimpleTestCase):
    """Testa isoladamente `GatewayPixBase`, `MockPixGateway` e `obter_gateway_pix`."""

    def setUp(self):
        self.gateway = MockPixGateway()

    def test_contrato_base_e_factory(self):
        self.assertIsInstance(obter_gateway_pix(), MockPixGateway)
        base = GatewayPixBase()
        with self.assertRaises(NotImplementedError):
            base.gerar_cobranca(None)
        with self.assertRaises(NotImplementedError):
            base.validar_assinatura_webhook(b"", "")

    @override_settings(DEBUG=True, PIX_WEBHOOK_SECRET="")
    def test_obter_segredo_usa_default_apenas_em_debug(self):
        self.assertEqual(self.gateway._obter_segredo(), DEFAULT_DEV_SECRET)

    @override_settings(DEBUG=False, PIX_WEBHOOK_SECRET="")
    def test_obter_segredo_retorna_none_em_producao_se_vazio_ou_default(self):
        self.assertIsNone(self.gateway._obter_segredo())
        with override_settings(DEBUG=False, PIX_WEBHOOK_SECRET=DEFAULT_DEV_SECRET):
            self.assertIsNone(self.gateway._obter_segredo())
        with override_settings(DEBUG=False, PIX_WEBHOOK_SECRET="segredo-producao-forte"):
            self.assertEqual(self.gateway._obter_segredo(), "segredo-producao-forte")

    def test_gerar_cobranca_monta_txid_valor_e_fallback_de_chave(self):
        pedido = SimpleNamespace(
            numero_publico="PED-AB12CD34",
            total_com_frete=Decimal("32.50"),
            produtor=SimpleNamespace(chave_pix="horta@pix.br", nome_propriedade="Sítio Agroecológico Potiguar"),
        )
        dados = self.gateway.gerar_cobranca(pedido)
        self.assertEqual(dados["txid"], "PEDAB12CD34")
        self.assertEqual(dados["status"], "ATIVA")
        self.assertEqual(dados["valor"], "32.50")
        self.assertEqual(dados["chave"], "horta@pix.br")
        self.assertTrue(dados["simulado"])
        self.assertIn("PEDAB12CD34", dados["copia_e_cola"])

        pedido_sem_chave = SimpleNamespace(
            numero_publico="PED-99990000",
            total_com_frete=Decimal("10.00"),
            produtor=SimpleNamespace(chave_pix="", nome_propriedade="Sítio Sem Chave"),
        )
        self.assertEqual(self.gateway.gerar_cobranca(pedido_sem_chave)["chave"], "feiravirtual@pix.local")

    @override_settings(DEBUG=False, PIX_WEBHOOK_SECRET="chave-secreta-hmac-2026")
    def test_validar_assinatura_webhook_hmac_sha256(self):
        payload = b'{"txid":"PEDAB12CD34","evento":"PAGAMENTO_CONFIRMADO"}'
        assinatura_ok = hmac.new(b"chave-secreta-hmac-2026", payload, hashlib.sha256).hexdigest()

        self.assertTrue(self.gateway.validar_assinatura_webhook(payload, assinatura_ok))
        self.assertFalse(self.gateway.validar_assinatura_webhook(payload, ""))
        self.assertFalse(self.gateway.validar_assinatura_webhook(payload, "assinatura-forjada"))

        with override_settings(DEBUG=False, PIX_WEBHOOK_SECRET=""):
            self.assertFalse(self.gateway.validar_assinatura_webhook(payload, assinatura_ok))


class NotificacoesUnitTests(SimpleTestCase):
    """Testa isoladamente `NotificadorEmail`, `NotificadorWhatsApp` e `CentralNotificacoes`."""

    def _pedido_fake(self, email="cli@ex.com", telefone="84999990000", previsao="Amanhã 09h"):
        return SimpleNamespace(
            numero_publico="PED-UNIT0001",
            cliente=SimpleNamespace(email=email, telefone=telefone, first_name="Joana", username="joana"),
            produtor=SimpleNamespace(nome_propriedade="Sítio Esperança"),
            previsao_entrega=previsao,
            total_com_frete=Decimal("25.00"),
            get_status_display=lambda: "Aceito",
        )

    def test_notificador_base_exige_implementacao(self):
        with self.assertRaises(NotImplementedError):
            NotificadorBase().notificar(None, None, "ACEITO")

    def test_notificador_email_envia_conteudo_e_ignora_sem_email(self):
        notif = NotificadorEmail()

        with mock.patch("pedidos.notificacoes.send_mail") as mock_mail:
            notif.notificar(self._pedido_fake(email=""), "PENDENTE", "ACEITO")
            mock_mail.assert_not_called()

        with mock.patch("pedidos.notificacoes.send_mail") as mock_mail:
            notif.notificar(self._pedido_fake(), "PENDENTE", "ACEITO", motivo="Confirmado pelo produtor")
            mock_mail.assert_called_once()
            kwargs = mock_mail.call_args.kwargs
            self.assertIn("PED-UNIT0001", kwargs["subject"])
            self.assertIn("Confirmado pelo produtor", kwargs["message"])
            self.assertIn("Amanhã 09h", kwargs["message"])
            self.assertEqual(kwargs["recipient_list"], ["cli@ex.com"])

    def test_notificador_whatsapp_loga_mock_e_ignora_sem_telefone(self):
        notif = NotificadorWhatsApp()

        with self.assertNoLogs("pedidos.notificacoes", level="INFO"):
            notif.notificar(self._pedido_fake(telefone=""), "PENDENTE", "PRONTO")

        with self.assertLogs("pedidos.notificacoes", level="INFO") as logs:
            notif.notificar(self._pedido_fake(telefone="84988887777"), "PENDENTE", "PRONTO")
        self.assertTrue(any("[WHATSAPP MOCK]" in msg and "84988887777" in msg for msg in logs.output))

    def test_central_notificacoes_isola_falha_entre_provedores(self):
        class ProvedorQuebrado(NotificadorBase):
            def notificar(self, pedido, status_anterior, novo_status, motivo=""):
                raise RuntimeError("SMTP fora do ar")

        provedor_ok = mock.MagicMock(spec=NotificadorBase)
        central = CentralNotificacoes()
        central.provedores = [ProvedorQuebrado(), provedor_ok]

        pedido = self._pedido_fake()
        with self.assertLogs("pedidos.notificacoes", level="ERROR") as logs:
            central.disparar(pedido, "PENDENTE", "ACEITO", "ok")

        provedor_ok.notificar.assert_called_once_with(pedido, "PENDENTE", "ACEITO", "ok")
        self.assertTrue(any("ProvedorQuebrado" in msg for msg in logs.output))


class CarrinhoCheckoutEServicesUnitTests(TestCase):
    """Testa diretamente `ItemCarrinhoSerializer`, `CheckoutSerializer`, `finalizar_carrinho` e `mudar_status`."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.cliente = Usuario.objects.create(username="cli_ped_u", email="cli_ped_u@ex.com", password="!", tipo=Usuario.Tipo.CLIENTE)
        self.outro_cli = Usuario.objects.create(username="cli_outro_u", email="cli_outro_u@ex.com", password="!", tipo=Usuario.Tipo.CLIENTE)
        self.prod_user = Usuario.objects.create(username="prod_ped_u", email="prod_ped_u@ex.com", password="!", tipo=Usuario.Tipo.PRODUTOR)
        self.outro_prod_user = Usuario.objects.create(username="prod2_ped_u", email="prod2_ped_u@ex.com", password="!", tipo=Usuario.Tipo.PRODUTOR)
        self.entregador = Usuario.objects.create(username="ent_ped_u", email="ent_ped_u@ex.com", password="!", tipo=Usuario.Tipo.ENTREGADOR)
        self.outro_ent = Usuario.objects.create(username="ent2_ped_u", email="ent2_ped_u@ex.com", password="!", tipo=Usuario.Tipo.ENTREGADOR)
        self.admin = Usuario.objects.create(
            username="adm_ped_u", email="adm_ped_u@ex.com", password="!", is_superuser=True, is_staff=True
        )

        self.perfil = PerfilProdutor.objects.create(
            usuario=self.prod_user,
            nome_propriedade="Sítio Unitário",
            status=PerfilProdutor.Status.APROVADO,
            chave_pix="unit@pix",
            aceita_dinheiro=True,
        )
        PerfilProdutor.objects.create(
            usuario=self.outro_prod_user,
            nome_propriedade="Sítio Vizinho",
            status=PerfilProdutor.Status.APROVADO,
        )
        self.cat = Categoria.objects.create(nome="Hortifruti Unit", ativa=True)
        self.prod_kg = Produto.objects.create(
            produtor=self.perfil,
            categoria=self.cat,
            nome="Batata Doce",
            preco=Decimal("6.00"),
            unidade_medida=Produto.Unidade.KG,
            estoque=Decimal("5.000"),
            ativo=True,
        )
        self.prod_maco = Produto.objects.create(
            produtor=self.perfil,
            categoria=self.cat,
            nome="Coentro",
            preco=Decimal("3.00"),
            unidade_medida=Produto.Unidade.MACO,
            estoque=Decimal("4.000"),
            ativo=True,
        )
        self.carrinho = Carrinho.objects.create(cliente=self.cliente)
        self.endereco = Endereco.objects.create(
            usuario=self.cliente,
            logradouro="Rua A",
            numero="10",
            bairro="Centro",
            cidade="Natal",
            estado="RN",
        )

    def test_item_carrinho_serializer_bloqueia_todos_estados_de_indisponibilidade(self):
        cenarios = [
            ("inativo", lambda: setattr(self.prod_kg, "ativo", False)),
            ("oculto_moderacao", lambda: setattr(self.prod_kg, "oculto_moderacao", True)),
            ("excluido_produto", lambda: setattr(self.prod_kg, "excluido_em", timezone.now())),
            ("categoria_inativa", lambda: setattr(self.cat, "ativa", False)),
            ("produtor_pendente", lambda: setattr(self.perfil, "status", PerfilProdutor.Status.PENDENTE)),
            ("produtor_excluido", lambda: setattr(self.perfil, "excluido_em", timezone.now())),
        ]
        for nome, mutacao in cenarios:
            with self.subTest(cenario=nome):
                # Restaura estado limpo
                self.prod_kg.ativo = True
                self.prod_kg.oculto_moderacao = False
                self.prod_kg.excluido_em = None
                self.cat.ativa = True
                self.perfil.status = PerfilProdutor.Status.APROVADO
                self.perfil.excluido_em = None
                self.cat.save()
                self.perfil.save()
                self.prod_kg.save()

                mutacao()
                self.cat.save()
                self.perfil.save()
                self.prod_kg.save()

                ser = ItemCarrinhoSerializer(
                    data={"produto": self.prod_kg.id, "quantidade": "1"},
                    context={"carrinho": self.carrinho},
                )
                self.assertFalse(ser.is_valid())
                self.assertIn("indisponível", str(ser.errors).lower())

    def test_item_carrinho_serializer_valida_unidades_inteiras_soma_estoque_e_trava_produto_no_patch(self):
        # Todas as UNIDADES_INTEIRAS rejeitam fração
        for unidade in UNIDADES_INTEIRAS:
            p = Produto.objects.create(
                produtor=self.perfil,
                categoria=self.cat,
                nome=f"Item {unidade}",
                preco=Decimal("2.00"),
                unidade_medida=unidade,
                estoque=Decimal("10"),
            )
            ser = ItemCarrinhoSerializer(
                data={"produto": p.id, "quantidade": "1.5"},
                context={"carrinho": self.carrinho},
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("quantidade", ser.errors)

        # KG aceita fração
        ser_kg = ItemCarrinhoSerializer(
            data={"produto": self.prod_kg.id, "quantidade": "1.250"},
            context={"carrinho": self.carrinho},
        )
        self.assertTrue(ser_kg.is_valid(), ser_kg.errors)

        # Soma com item já no carrinho detecta excesso de estoque (3 + 3 > 5)
        item = ItemCarrinho.objects.create(carrinho=self.carrinho, produto=self.prod_kg, quantidade=Decimal("3.000"))
        ser_excesso = ItemCarrinhoSerializer(
            data={"produto": self.prod_kg.id, "quantidade": "3.000"},
            context={"carrinho": self.carrinho},
        )
        self.assertFalse(ser_excesso.is_valid())
        self.assertIn("estoque", str(ser_excesso.errors).lower())

        # get_fields() torna `produto` read_only quando instance != None
        self.assertFalse(ItemCarrinhoSerializer().get_fields()["produto"].read_only)
        self.assertTrue(ItemCarrinhoSerializer(instance=item).get_fields()["produto"].read_only)

    def test_checkout_serializer_valida_modalidade_e_titularidade_do_endereco(self):
        req = self.factory.post("/api/pedidos/")
        req.user = self.cliente

        # RETIRADA dispensa endereço
        s_ret = CheckoutSerializer(
            data={"modalidade": Pedido.Modalidade.RETIRADA, "forma_pagamento": Pedido.FormaPagamento.PIX},
            context={"request": req},
        )
        self.assertTrue(s_ret.is_valid(), s_ret.errors)
        self.assertIsNone(s_ret.validated_data["endereco"])

        # ENTREGA sem endereco_id falha
        s_sem = CheckoutSerializer(
            data={"modalidade": Pedido.Modalidade.ENTREGA, "forma_pagamento": Pedido.FormaPagamento.PIX},
            context={"request": req},
        )
        self.assertFalse(s_sem.is_valid())
        self.assertIn("endereco_id", s_sem.errors)

        # ENTREGA com endereço de outro cliente falha
        end_outro = Endereco.objects.create(
            usuario=self.outro_cli, logradouro="Rua Z", numero="1", bairro="B", cidade="Natal", estado="RN"
        )
        s_alheio = CheckoutSerializer(
            data={
                "modalidade": Pedido.Modalidade.ENTREGA,
                "forma_pagamento": Pedido.FormaPagamento.PIX,
                "endereco_id": end_outro.id,
            },
            context={"request": req},
        )
        self.assertFalse(s_alheio.is_valid())
        self.assertIn("endereco_id", s_alheio.errors)

        # ENTREGA com endereço próprio passa
        s_ok = CheckoutSerializer(
            data={
                "modalidade": Pedido.Modalidade.ENTREGA,
                "forma_pagamento": Pedido.FormaPagamento.PIX,
                "endereco_id": self.endereco.id,
            },
            context={"request": req},
        )
        self.assertTrue(s_ok.is_valid(), s_ok.errors)
        self.assertEqual(s_ok.validated_data["endereco"], self.endereco)

    def test_finalizar_carrinho_validacoes_taxa_negativa_snapshot_e_disparo_notificacao(self):
        # Carrinho vazio falha
        with self.assertRaises(DRFValidationError):
            finalizar_carrinho(self.cliente, Pedido.Modalidade.RETIRADA, None, Pedido.FormaPagamento.PIX)

        ItemCarrinho.objects.create(carrinho=self.carrinho, produto=self.prod_kg, quantidade=Decimal("2.000"))

        # Entrega sem endereço falha
        with self.assertRaises(DRFValidationError):
            finalizar_carrinho(self.cliente, Pedido.Modalidade.ENTREGA, None, Pedido.FormaPagamento.PIX)

        # Taxa negativa é sanitizada para 0.00 e notificador.disparar é acionado
        with mock.patch("pedidos.services.notificador.disparar") as mock_disp:
            pedidos = finalizar_carrinho(
                self.cliente,
                Pedido.Modalidade.ENTREGA,
                self.endereco,
                Pedido.FormaPagamento.PIX,
                observacao="Sem sacola",
                taxa_entrega=Decimal("-25.00"),
            )

        self.assertEqual(len(pedidos), 1)
        ped = pedidos[0]
        self.assertEqual(ped.taxa_entrega, Decimal("0.00"))
        self.assertEqual(ped.total, Decimal("12.00"))
        self.assertEqual(self.carrinho.itens.count(), 0)
        mock_disp.assert_called_once_with(ped, None, Pedido.Status.PENDENTE, "Sem sacola")

        # Alterar preço do produto depois não altera o snapshot do ItemPedido
        self.prod_kg.preco = Decimal("99.90")
        self.prod_kg.save(update_fields=["preco"])
        item_ped = ped.itens.get()
        self.assertEqual(item_ped.preco_unitario, Decimal("6.00"))
        self.assertEqual(item_ped.subtotal, Decimal("12.00"))

        # Retirada sempre zera taxa_entrega mesmo quando informada positiva
        ItemCarrinho.objects.create(carrinho=self.carrinho, produto=self.prod_maco, quantidade=Decimal("1"))
        with mock.patch("pedidos.services.notificador.disparar"):
            ped_ret = finalizar_carrinho(
                self.cliente,
                Pedido.Modalidade.RETIRADA,
                self.endereco,
                Pedido.FormaPagamento.DINHEIRO,
                taxa_entrega=Decimal("9.90"),
            )[0]
        self.assertEqual(ped_ret.taxa_entrega, Decimal("0.00"))
        self.assertEqual(ped_ret.endereco_entrega, "")

    def test_mudar_status_regras_de_transicao_e_papeis(self):
        ItemCarrinho.objects.create(carrinho=self.carrinho, produto=self.prod_kg, quantidade=Decimal("2.000"))
        with mock.patch("pedidos.services.notificador.disparar"):
            ped = finalizar_carrinho(
                self.cliente, Pedido.Modalidade.ENTREGA, self.endereco, Pedido.FormaPagamento.PIX
            )[0]

        # Transição inválida no grafo (PENDENTE -> CONCLUIDO)
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.CONCLUIDO, self.prod_user)

        # Outro cliente e outro produtor são bloqueados
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.CANCELADO, self.outro_cli)
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.ACEITO, self.outro_prod_user)

        # Admin não opera máquina de estados via mudar_status
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.ACEITO, self.admin)

        # Produtor aceita (baixa estoque 5 -> 3) e inicia preparo
        with mock.patch("pedidos.services.notificador.disparar") as mock_disp:
            mudar_status(ped, Pedido.Status.ACEITO, self.prod_user, previsao_entrega="Hoje 17h")
        self.prod_kg.refresh_from_db()
        self.assertEqual(self.prod_kg.estoque, Decimal("3.000"))
        self.assertEqual(mock_disp.call_count, 1)

        with mock.patch("pedidos.services.notificador.disparar"):
            mudar_status(ped, Pedido.Status.EM_PREPARO, self.prod_user)

        # Cliente não pode cancelar após EM_PREPARO
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.CANCELADO, self.cliente)

        with mock.patch("pedidos.services.notificador.disparar"):
            mudar_status(ped, Pedido.Status.PRONTO, self.prod_user)

        # Produtor não marca EM_ENTREGA nem conclui pedido de ENTREGA
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.EM_ENTREGA, self.prod_user)
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.CONCLUIDO, self.prod_user)

        # Atribui entregador: outro entregador bloqueado; titular não pula PRONTO -> CONCLUIDO
        ped.entregador = self.entregador
        ped.save(update_fields=["entregador"])
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.EM_ENTREGA, self.outro_ent)
        with self.assertRaises(DRFValidationError):
            mudar_status(ped, Pedido.Status.CONCLUIDO, self.entregador)

        # Fluxo válido do entregador
        with mock.patch("pedidos.services.notificador.disparar"):
            mudar_status(ped, Pedido.Status.EM_ENTREGA, self.entregador)
            mudar_status(ped, Pedido.Status.CONCLUIDO, self.entregador)
        ped.refresh_from_db()
        self.assertEqual(ped.status, Pedido.Status.CONCLUIDO)
        self.assertEqual(HistoricoStatus.objects.filter(pedido=ped).count(), 6)

    def test_mudar_status_cancela_pendente_sem_devolver_estoque_e_trata_produto_removido(self):
        # Pedido cancelado ainda PENDENTE não soma estoque indevidamente
        ItemCarrinho.objects.create(carrinho=self.carrinho, produto=self.prod_maco, quantidade=Decimal("2"))
        with mock.patch("pedidos.services.notificador.disparar"):
            ped_pend = finalizar_carrinho(
                self.cliente, Pedido.Modalidade.RETIRADA, None, Pedido.FormaPagamento.PIX
            )[0]
            mudar_status(ped_pend, Pedido.Status.CANCELADO, self.cliente, motivo="Desisti")

        self.prod_maco.refresh_from_db()
        self.assertEqual(self.prod_maco.estoque, Decimal("4.000"))
        ped_pend.refresh_from_db()
        self.assertEqual(ped_pend.motivo_cancelamento, "Desisti")

        # Aceite falha claramente se o produto do item foi removido do banco
        ped_orf = Pedido.objects.create(
            cliente=self.cliente,
            produtor=self.perfil,
            modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO,
            total=Decimal("10.00"),
        )
        ItemPedido.objects.create(
            pedido=ped_orf,
            produto=None,
            nome_produto="Produto Removido",
            unidade_medida=Produto.Unidade.UNIDADE,
            preco_unitario=Decimal("10.00"),
            quantidade=Decimal("1"),
        )
        with self.assertRaises(DRFValidationError) as ctx:
            mudar_status(ped_orf, Pedido.Status.ACEITO, self.prod_user)
        self.assertIn("removido", str(ctx.exception).lower())
