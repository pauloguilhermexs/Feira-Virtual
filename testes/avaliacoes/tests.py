from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from avaliacoes.models import Avaliacao, Reclamacao
from catalogo.models import Categoria, Produto
from pedidos.models import ItemPedido, Pedido
from usuarios.models import PerfilProdutor, Usuario

PW = "Senha-Forte-123!"


class AvaliacoesTests(APITestCase):
    def setUp(self):
        self.cliente = Usuario.objects.create_user("cliente_av", "cli_av@ex.com", PW, tipo=Usuario.Tipo.CLIENTE)
        self.outro_cliente = Usuario.objects.create_user("outro_cli", "outro@ex.com", PW, tipo=Usuario.Tipo.CLIENTE)
        self.produtor_user = Usuario.objects.create_user("prod_av", "prod_av@ex.com", PW, tipo=Usuario.Tipo.PRODUTOR)
        self.perfil = PerfilProdutor.objects.create(
            usuario=self.produtor_user,
            nome_propriedade="Horta Viva",
            status=PerfilProdutor.Status.APROVADO,
        )
        self.cat = Categoria.objects.create(nome="Legumes", ativa=True)
        self.produto = Produto.objects.create(
            produtor=self.perfil,
            categoria=self.cat,
            nome="Cenoura",
            preco=Decimal("4.00"),
            estoque=Decimal("50"),
            unidade_medida=Produto.Unidade.KG,
            ativo=True,
        )

    def login(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": PW}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")

    def test_avaliacao_so_quem_comprou(self):
        self.login("cliente_av")
        # Sem ter comprado
        r_erro = self.client.post("/api/avaliacoes/", {"produto": self.produto.id, "nota": 5}, format="json")
        self.assertEqual(r_erro.status_code, status.HTTP_400_BAD_REQUEST)

        # Simula pedido concluído
        pedido = Pedido.objects.create(
            cliente=self.cliente,
            produtor=self.perfil,
            modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO,
            status=Pedido.Status.CONCLUIDO,
            total=Decimal("8.00"),
        )
        ItemPedido.objects.create(
            pedido=pedido,
            produto=self.produto,
            nome_produto=self.produto.nome,
            unidade_medida=self.produto.unidade_medida,
            preco_unitario=self.produto.preco,
            quantidade=Decimal("2"),
        )

        # Avaliação com sucesso
        r_ok = self.client.post(
            "/api/avaliacoes/",
            {"produto": self.produto.id, "nota": 5, "comentario": "Excelente qualidade!"},
            format="json",
        )
        self.assertEqual(r_ok.status_code, status.HTTP_201_CREATED)

        # Não permite segunda avaliação no mesmo produto
        r_dupl = self.client.post("/api/avaliacoes/", {"produto": self.produto.id, "nota": 4}, format="json")
        self.assertEqual(r_dupl.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reclamacao_cliente_e_outro_cliente(self):
        pedido = Pedido.objects.create(
            cliente=self.cliente,
            produtor=self.perfil,
            modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO,
            status=Pedido.Status.CONCLUIDO,
            total=Decimal("8.00"),
        )

        # Outro cliente não pode abrir reclamação no pedido alheio
        self.login("outro_cli")
        r_invalido = self.client.post(
            "/api/reclamacoes/",
            {"pedido": pedido.id, "assunto": "Problema", "descricao": "Não recebi"},
            format="json",
        )
        self.assertEqual(r_invalido.status_code, status.HTTP_400_BAD_REQUEST)

        # Titular do pedido abre com sucesso
        self.login("cliente_av")
        r_valido = self.client.post(
            "/api/reclamacoes/",
            {"pedido": pedido.id, "assunto": "Atraso", "descricao": "Demorou para entregar"},
            format="json",
        )
        self.assertEqual(r_valido.status_code, status.HTTP_201_CREATED)

    def test_produtor_avalia_cliente_apos_pedido_concluido_e_bloqueios(self):
        outro_prod_user = Usuario.objects.create_user("prod_av2", "prod_av2@ex.com", PW, tipo=Usuario.Tipo.PRODUTOR)
        PerfilProdutor.objects.create(
            usuario=outro_prod_user,
            nome_propriedade="Sítio Outro",
            status=PerfilProdutor.Status.APROVADO,
        )
        pedido = Pedido.objects.create(
            cliente=self.cliente,
            produtor=self.perfil,
            modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO,
            status=Pedido.Status.EM_PREPARO,
            total=Decimal("12.00"),
        )

        # Cliente não pode acessar endpoint exclusivo de produtor
        self.login("cliente_av")
        r_forb = self.client.post("/api/produtor/avaliacoes-clientes/", {"pedido": pedido.id, "nota": 5}, format="json")
        self.assertEqual(r_forb.status_code, status.HTTP_403_FORBIDDEN)

        # Produtor não pode avaliar antes da conclusão do pedido
        self.login("prod_av")
        r_antes = self.client.post("/api/produtor/avaliacoes-clientes/", {"pedido": pedido.id, "nota": 5}, format="json")
        self.assertEqual(r_antes.status_code, status.HTTP_400_BAD_REQUEST)

        # Conclui o pedido
        pedido.status = Pedido.Status.CONCLUIDO
        pedido.save(update_fields=["status"])

        # Outro produtor não pode avaliar cliente de pedido alheio
        self.login("prod_av2")
        r_alheio = self.client.post("/api/produtor/avaliacoes-clientes/", {"pedido": pedido.id, "nota": 4}, format="json")
        self.assertEqual(r_alheio.status_code, status.HTTP_400_BAD_REQUEST)

        # Produtor titular avalia com sucesso
        self.login("prod_av")
        r_ok = self.client.post(
            "/api/produtor/avaliacoes-clientes/",
            {"pedido": pedido.id, "nota": 5, "comentario": "Cliente pontual e educado."},
            format="json",
        )
        self.assertEqual(r_ok.status_code, status.HTTP_201_CREATED, r_ok.data)
        self.assertEqual(r_ok.data["cliente"], self.cliente.id)
        av_id = r_ok.data["id"]

        # Impede duplicidade para o mesmo pedido
        r_dup = self.client.post(
            "/api/produtor/avaliacoes-clientes/",
            {"pedido": pedido.id, "nota": 3},
            format="json",
        )
        self.assertEqual(r_dup.status_code, status.HTTP_400_BAD_REQUEST)

        # Impede edição ou exclusão (imutabilidade das avaliações)
        self.assertIn(
            self.client.patch(f"/api/produtor/avaliacoes-clientes/{av_id}/", {"nota": 1}, format="json").status_code,
            (status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED),
        )
        self.assertIn(
            self.client.delete(f"/api/produtor/avaliacoes-clientes/{av_id}/").status_code,
            (status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED),
        )

        # Consulta lista de avaliações feitas pelo produtor
        r_list = self.client.get("/api/produtor/avaliacoes-clientes/")
        self.assertEqual(r_list.status_code, status.HTTP_200_OK)
        self.assertEqual(r_list.data["count"], 1)
        self.assertEqual(r_list.data["results"][0]["comentario"], "Cliente pontual e educado.")

    def test_avaliacao_cliente_produto_e_produtor_por_pedido_historico_e_autor(self):
        # Pedido ainda não concluído -> não pode avaliar
        ped_pendente = Pedido.objects.create(
            cliente=self.cliente,
            produtor=self.perfil,
            modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO,
            status=Pedido.Status.PENDENTE,
            total=Decimal("4.00"),
        )
        ItemPedido.objects.create(
            pedido=ped_pendente, produto=self.produto, nome_produto=self.produto.nome,
            unidade_medida=self.produto.unidade_medida, preco_unitario=self.produto.preco, quantidade=Decimal("1"),
        )
        self.login("cliente_av")
        self.assertEqual(
            self.client.post("/api/avaliacoes/", {"pedido": ped_pendente.id, "produto": self.produto.id, "nota": 5}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Dois pedidos concluídos distintos -> duas oportunidades independentes de avaliação
        ped1 = Pedido.objects.create(
            cliente=self.cliente, produtor=self.perfil, modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO, status=Pedido.Status.CONCLUIDO, total=Decimal("8.00"),
        )
        ItemPedido.objects.create(
            pedido=ped1, produto=self.produto, nome_produto=self.produto.nome,
            unidade_medida=self.produto.unidade_medida, preco_unitario=self.produto.preco, quantidade=Decimal("2"),
        )
        ped2 = Pedido.objects.create(
            cliente=self.cliente, produtor=self.perfil, modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO, status=Pedido.Status.CONCLUIDO, total=Decimal("4.00"),
        )
        ItemPedido.objects.create(
            pedido=ped2, produto=self.produto, nome_produto=self.produto.nome,
            unidade_medida=self.produto.unidade_medida, preco_unitario=self.produto.preco, quantidade=Decimal("1"),
        )

        # Nota fora do intervalo (0 e 6) -> 400
        self.assertEqual(
            self.client.post("/api/avaliacoes/", {"pedido": ped1.id, "produto": self.produto.id, "nota": 0}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post("/api/avaliacoes/", {"pedido": ped1.id, "produto": self.produto.id, "nota": 6}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Outro cliente tenta avaliar o pedido do titular -> 400
        self.login("outro_cli")
        self.assertEqual(
            self.client.post("/api/avaliacoes/", {"pedido": ped1.id, "produto": self.produto.id, "nota": 5}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post("/api/avaliacoes/", {"produtor": self.perfil.id, "nota": 5}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Cliente avalia produto no ped1 e no ped2 (compras independentes) + produtor no ped1
        self.login("cliente_av")
        r_p1 = self.client.post("/api/avaliacoes/", {"pedido": ped1.id, "produto": self.produto.id, "nota": 5, "comentario": "Ótima"}, format="json")
        self.assertEqual(r_p1.status_code, status.HTTP_201_CREATED, r_p1.data)
        # Duplicata no mesmo pedido bloqueada
        self.assertEqual(
            self.client.post("/api/avaliacoes/", {"pedido": ped1.id, "produto": self.produto.id, "nota": 4}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        # Segunda compra do mesmo produto permitida
        r_p2 = self.client.post("/api/avaliacoes/", {"pedido": ped2.id, "produto": self.produto.id, "nota": 3}, format="json")
        self.assertEqual(r_p2.status_code, status.HTTP_201_CREATED, r_p2.data)

        # Avaliar produtor no ped1 e bloquear duplicata no ped1
        r_prod1 = self.client.post("/api/avaliacoes/", {"pedido": ped1.id, "produtor": self.perfil.id, "nota": 5, "comentario": "Atendimento excelente"}, format="json")
        self.assertEqual(r_prod1.status_code, status.HTTP_201_CREATED, r_prod1.data)
        self.assertEqual(
            self.client.post("/api/avaliacoes/", {"pedido": ped1.id, "produtor": self.perfil.id, "nota": 4}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Página pública do produtor e produto exibem médias e contagens reais
        self.client.credentials()
        r_pub_prod = self.client.get(f"/api/produtos/{self.produto.id}/")
        self.assertEqual(r_pub_prod.data["nota_media"], 4.0)
        self.assertEqual(r_pub_prod.data["total_avaliacoes"], 2)

        r_pub_produtor = self.client.get(f"/api/produtores/{self.perfil.id}/")
        self.assertEqual(r_pub_produtor.data["nota_media"], 5.0)
        self.assertEqual(r_pub_produtor.data["total_avaliacoes"], 1)

        # Histórico do cliente + edição/exclusão restrita ao próprio autor
        self.login("outro_cli")
        av_id = r_p1.data["id"]
        self.assertEqual(self.client.patch(f"/api/avaliacoes/{av_id}/", {"nota": 1}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(f"/api/avaliacoes/{av_id}/").status_code, status.HTTP_403_FORBIDDEN)

        self.login("cliente_av")
        r_minhas = self.client.get("/api/avaliacoes/minhas/")
        self.assertEqual(r_minhas.status_code, status.HTTP_200_OK)
        self.assertEqual(r_minhas.data["count"], 3)

        r_edit = self.client.patch(f"/api/avaliacoes/{av_id}/", {"nota": 4, "comentario": "Atualizada"}, format="json")
        self.assertEqual(r_edit.status_code, status.HTTP_200_OK)
        self.assertEqual(r_edit.data["nota"], 4)
        self.assertEqual(self.client.delete(f"/api/avaliacoes/{r_p2.data['id']}/").status_code, status.HTTP_204_NO_CONTENT)
