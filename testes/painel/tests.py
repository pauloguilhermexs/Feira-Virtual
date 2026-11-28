from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from catalogo.models import Categoria, Produto
from painel.models import LogAuditoria
from usuarios.models import PerfilProdutor, Usuario

PW = "Senha-Forte-123!"


class PainelAdminTests(APITestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser("admin_pnl", "admin_pnl@ex.com", PW)
        self.cliente = Usuario.objects.create_user("cliente_pnl", "cli_pnl@ex.com", PW, tipo=Usuario.Tipo.CLIENTE)
        self.produtor_user = Usuario.objects.create_user("prod_pnl", "prod_pnl@ex.com", PW, tipo=Usuario.Tipo.PRODUTOR)
        self.perfil = PerfilProdutor.objects.create(
            usuario=self.produtor_user,
            nome_propriedade="Chácara Sol",
            status=PerfilProdutor.Status.PENDENTE,
        )
        self.cat = Categoria.objects.create(nome="Frutas Pnl", ativa=True)
        self.produto = Produto.objects.create(
            produtor=self.perfil,
            categoria=self.cat,
            nome="Maçã",
            preco=Decimal("5.00"),
            estoque=Decimal("10"),
            unidade_medida=Produto.Unidade.KG,
            ativo=True,
        )

    def login(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": PW}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")

    def test_permissoes_admin(self):
        # Cliente toma 403
        self.login("cliente_pnl")
        r = self.client.get("/api/admin/indicadores/")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

        # Produtor toma 403
        self.login("prod_pnl")
        r_prod = self.client.get("/api/admin/usuarios/")
        self.assertEqual(r_prod.status_code, status.HTTP_403_FORBIDDEN)

        # Admin tem acesso
        self.login("admin_pnl")
        r_admin = self.client.get("/api/admin/indicadores/")
        self.assertEqual(r_admin.status_code, status.HTTP_200_OK)

    def test_bloquear_e_reativar_usuario_com_auditoria(self):
        self.login("admin_pnl")
        # Bloquear cliente
        r_block = self.client.post(f"/api/admin/usuarios/{self.cliente.id}/bloquear/")
        self.assertEqual(r_block.status_code, status.HTTP_200_OK)
        self.cliente.refresh_from_db()
        self.assertFalse(self.cliente.is_active)

        # Checa registro de auditoria
        self.assertTrue(LogAuditoria.objects.filter(acao=LogAuditoria.Acao.BLOQUEAR_USUARIO).exists())

        # Reativar
        r_reat = self.client.post(f"/api/admin/usuarios/{self.cliente.id}/reativar/")
        self.assertEqual(r_reat.status_code, status.HTTP_200_OK)
        self.cliente.refresh_from_db()
        self.assertTrue(self.cliente.is_active)

    def test_aprovar_e_suspender_produtor(self):
        self.login("admin_pnl")
        # Aprovar
        r_aprov = self.client.post(f"/api/admin/produtores/{self.perfil.id}/aprovar/")
        self.assertEqual(r_aprov.status_code, status.HTTP_200_OK)
        self.perfil.refresh_from_db()
        self.assertEqual(self.perfil.status, PerfilProdutor.Status.APROVADO)

        # Suspender
        r_susp = self.client.post(f"/api/admin/produtores/{self.perfil.id}/suspender/")
        self.assertEqual(r_susp.status_code, status.HTTP_200_OK)
        self.perfil.refresh_from_db()
        self.assertEqual(self.perfil.status, PerfilProdutor.Status.SUSPENSO)

    def test_ocultar_e_reexibir_produto(self):
        self.perfil.status = PerfilProdutor.Status.APROVADO
        self.perfil.save(update_fields=["status"])

        self.login("admin_pnl")
        # Ocultar pela moderação
        r_ocult = self.client.post(f"/api/admin/produtos/{self.produto.id}/ocultar/")
        self.assertEqual(r_ocult.status_code, status.HTTP_200_OK)
        self.produto.refresh_from_db()
        self.assertFalse(self.produto.ativo)
        self.assertTrue(self.produto.oculto_moderacao)

        # Produtor NÃO consegue desfazer a moderação administrativa via PATCH (BE-02)
        self.login("prod_pnl")
        r_try = self.client.patch(
            f"/api/produtor/produtos/{self.produto.id}/",
            {"ativo": True, "oculto_moderacao": False},
            format="json",
        )
        self.assertEqual(r_try.status_code, status.HTTP_200_OK)
        self.produto.refresh_from_db()
        self.assertTrue(self.produto.oculto_moderacao)
        # Continua invisível no catálogo público
        self.client.credentials()
        self.assertEqual(self.client.get("/api/produtos/").data["count"], 0)

        # Somente o admin pode reexibir
        self.login("admin_pnl")
        r_reex = self.client.post(f"/api/admin/produtos/{self.produto.id}/reexibir/")
        self.assertEqual(r_reex.status_code, status.HTTP_200_OK)
        self.produto.refresh_from_db()
        self.assertTrue(self.produto.ativo)
        self.assertFalse(self.produto.oculto_moderacao)
        self.client.credentials()
        self.assertEqual(self.client.get("/api/produtos/").data["count"], 1)

    def test_moderar_reclamacao_registra_auditoria(self):
        from avaliacoes.models import Reclamacao
        from pedidos.models import Pedido

        pedido = Pedido.objects.create(
            cliente=self.cliente,
            produtor=self.perfil,
            modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO,
            total=Decimal("10.00"),
        )
        rec = Reclamacao.objects.create(
            pedido=pedido,
            cliente=self.cliente,
            assunto="Produto avariado",
            descricao="Chegou amassado",
        )
        self.login("admin_pnl")
        r = self.client.patch(
            f"/api/admin/reclamacoes/{rec.id}/",
            {"status": "RESOLVIDA", "resposta_admin": "Reembolso efetuado."},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(
            LogAuditoria.objects.filter(
                usuario=self.admin,
                acao=LogAuditoria.Acao.MODERAR_RECLAMACAO,
            ).exists()
        )

    def test_admin_exclui_e_desativa_produto_produtor_e_cliente_preservando_historico(self):
        from avaliacoes.models import Avaliacao
        from pedidos.models import ItemPedido, Pedido

        self.perfil.status = PerfilProdutor.Status.APROVADO
        self.perfil.save(update_fields=["status"])

        # Produto sem dependências -> exclusão física
        prod_sem_hist = Produto.objects.create(
            produtor=self.perfil, categoria=self.cat, nome="Alho Poró",
            preco=Decimal("6.00"), estoque=Decimal("5"), unidade_medida=Produto.Unidade.MACO, ativo=True,
        )
        # Cliente sem dependências -> exclusão física
        cli_sem_hist = Usuario.objects.create_user("cli_livre", "cli_livre@ex.com", PW, tipo=Usuario.Tipo.CLIENTE)
        # Produtor sem dependências -> exclusão física
        prod_u_livre = Usuario.objects.create_user("prod_livre", "prod_livre@ex.com", PW, tipo=Usuario.Tipo.PRODUTOR)
        perfil_livre = PerfilProdutor.objects.create(usuario=prod_u_livre, nome_propriedade="Sítio Vazio", status=PerfilProdutor.Status.PENDENTE)

        # Pedido concluído e avaliação vinculando self.produto, self.perfil e self.cliente
        pedido = Pedido.objects.create(
            cliente=self.cliente, produtor=self.perfil, modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO, status=Pedido.Status.CONCLUIDO, total=Decimal("10.00"),
        )
        ItemPedido.objects.create(
            pedido=pedido, produto=self.produto, nome_produto=self.produto.nome,
            unidade_medida=self.produto.unidade_medida, preco_unitario=self.produto.preco, quantidade=Decimal("2"),
        )
        av = Avaliacao.objects.create(cliente=self.cliente, pedido=pedido, produto=self.produto, nota=5, comentario="Top")

        # Usuário comum não pode excluir produto via admin
        self.login("cliente_pnl")
        self.assertEqual(self.client.delete(f"/api/admin/produtos/{prod_sem_hist.id}/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(f"/api/admin/produtores/{self.perfil.id}/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.delete(f"/api/admin/usuarios/{cli_sem_hist.id}/").status_code, status.HTTP_403_FORBIDDEN)

        # Admin: exclusão física de registros sem histórico
        self.login("admin_pnl")
        r_del_p = self.client.delete(f"/api/admin/produtos/{prod_sem_hist.id}/")
        self.assertEqual(r_del_p.status_code, status.HTTP_200_OK)
        self.assertEqual(r_del_p.data["acao"], "excluido")
        self.assertFalse(Produto.objects.filter(pk=prod_sem_hist.id).exists())

        r_del_pr = self.client.delete(f"/api/admin/produtores/{perfil_livre.id}/")
        self.assertEqual(r_del_pr.status_code, status.HTTP_200_OK)
        self.assertEqual(r_del_pr.data["acao"], "excluido")
        self.assertFalse(PerfilProdutor.objects.filter(pk=perfil_livre.id).exists())

        r_del_u = self.client.delete(f"/api/admin/usuarios/{cli_sem_hist.id}/")
        self.assertEqual(r_del_u.status_code, status.HTTP_200_OK)
        self.assertEqual(r_del_u.data["acao"], "excluido")
        self.assertFalse(Usuario.objects.filter(pk=cli_sem_hist.id).exists())

        # Admin não pode excluir a própria conta
        self.assertEqual(self.client.delete(f"/api/admin/usuarios/{self.admin.id}/").status_code, status.HTTP_400_BAD_REQUEST)

        # Admin: desativação lógica (soft delete) de produto, produtor e cliente com histórico
        r_soft_p = self.client.delete(f"/api/admin/produtos/{self.produto.id}/")
        self.assertEqual(r_soft_p.status_code, status.HTTP_200_OK)
        self.assertEqual(r_soft_p.data["acao"], "desativado")
        self.produto.refresh_from_db()
        self.assertFalse(self.produto.ativo)
        self.assertIsNotNone(self.produto.excluido_em)
        # Produto desativado não aparece no catálogo público
        self.assertEqual(self.client.get("/api/produtos/").data["count"], 0)

        r_soft_pr = self.client.delete(f"/api/admin/produtores/{self.perfil.id}/")
        self.assertEqual(r_soft_pr.status_code, status.HTTP_200_OK)
        self.assertEqual(r_soft_pr.data["acao"], "desativado")
        self.perfil.refresh_from_db()
        self.assertEqual(self.perfil.status, PerfilProdutor.Status.SUSPENSO)
        self.assertIsNotNone(self.perfil.excluido_em)
        self.assertEqual(self.client.get("/api/produtores/").data["count"], 0)

        r_soft_cli = self.client.delete(f"/api/admin/usuarios/{self.cliente.id}/")
        self.assertEqual(r_soft_cli.status_code, status.HTTP_200_OK)
        self.assertEqual(r_soft_cli.data["acao"], "desativado")
        self.cliente.refresh_from_db()
        self.assertFalse(self.cliente.is_active)
        self.assertIsNotNone(self.cliente.excluido_em)

        # Integridade referencial preservada: pedido e avaliação continuam intactos no banco!
        self.assertTrue(Pedido.objects.filter(pk=pedido.id).exists())
        self.assertTrue(Avaliacao.objects.filter(pk=av.id).exists())
        self.assertTrue(LogAuditoria.objects.filter(acao=LogAuditoria.Acao.DESATIVAR_PRODUTO).exists())
        self.assertTrue(LogAuditoria.objects.filter(acao=LogAuditoria.Acao.DESATIVAR_PRODUTOR).exists())
        self.assertTrue(LogAuditoria.objects.filter(acao=LogAuditoria.Acao.DESATIVAR_USUARIO).exists())

        # Endpoints de detalhes e avaliações administrativas funcionando
        self.assertEqual(self.client.get(f"/api/admin/usuarios/{self.cliente.id}/detalhes/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/admin/produtores/{self.perfil.id}/detalhes/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get("/api/admin/avaliacoes/").data["count"], 1)
