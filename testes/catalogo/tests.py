from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from catalogo.models import Categoria, Produto
from usuarios.models import PerfilProdutor, Usuario

PW = "Senha-Forte-123!"


class CatalogoTests(APITestCase):
    def setUp(self):
        self.admin = Usuario.objects.create_superuser("admin_cat", "admin_cat@ex.com", PW)
        self.cliente = Usuario.objects.create_user("cliente_cat", "cli@ex.com", PW, tipo=Usuario.Tipo.CLIENTE)

        # Produtor 1
        self.user_prod1 = Usuario.objects.create_user("produtor1", "prod1@ex.com", PW, tipo=Usuario.Tipo.PRODUTOR)
        self.perfil1 = PerfilProdutor.objects.create(
            usuario=self.user_prod1,
            nome_propriedade="Sítio Verde",
            cidade="Campinas",
            estado="SP",
            status=PerfilProdutor.Status.APROVADO,
        )

        # Produtor 2
        self.user_prod2 = Usuario.objects.create_user("produtor2", "prod2@ex.com", PW, tipo=Usuario.Tipo.PRODUTOR)
        self.perfil2 = PerfilProdutor.objects.create(
            usuario=self.user_prod2,
            nome_propriedade="Fazenda Sol",
            cidade="Valinhos",
            estado="SP",
            status=PerfilProdutor.Status.APROVADO,
        )

        self.categoria = Categoria.objects.create(nome="Hortaliças", ativa=True)
        self.produto1 = Produto.objects.create(
            produtor=self.perfil1,
            categoria=self.categoria,
            nome="Couve Orgânica",
            preco=Decimal("3.00"),
            estoque=Decimal("20"),
            unidade_medida=Produto.Unidade.MACO,
            tipo_producao=Produto.TipoProducao.ORGANICO_CERTIFICADO,
            ativo=True,
        )

    def login(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": PW}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")

    def test_categoria_permissoes(self):
        # Visitante/Cliente não pode criar categoria
        self.login("cliente_cat")
        r = self.client.post("/api/categorias/", {"nome": "Frutas", "ativa": True}, format="json")
        self.assertEqual(r.status_code, status.HTTP_403_FORBIDDEN)

        # Admin pode criar
        self.login("admin_cat")
        r_admin = self.client.post("/api/categorias/", {"nome": "Frutas", "ativa": True}, format="json")
        self.assertEqual(r_admin.status_code, status.HTTP_201_CREATED)

    def test_excluir_categoria_com_produtos_retorna_400(self):
        self.login("admin_cat")
        r = self.client.delete(f"/api/categorias/{self.categoria.id}/")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("desative", str(r.data).lower())

    def test_categorias_publicas_so_ativas_e_admin_ve_todas(self):
        Categoria.objects.create(nome="Inativa Teste", ativa=False)
        self.client.credentials()
        r_pub = self.client.get("/api/categorias/")
        self.assertEqual(r_pub.status_code, status.HTTP_200_OK)
        nomes_pub = [c["nome"] for c in r_pub.data]
        self.assertIn("Hortaliças", nomes_pub)
        self.assertNotIn("Inativa Teste", nomes_pub)

        self.login("admin_cat")
        r_adm = self.client.get("/api/categorias/")
        nomes_adm = [c["nome"] for c in r_adm.data]
        self.assertIn("Inativa Teste", nomes_adm)

    def test_produtor_publico_expoe_aceita_pix_sem_chave(self):
        self.perfil1.chave_pix = "verde@pix.com"
        self.perfil1.save(update_fields=["chave_pix"])
        self.perfil2.chave_pix = ""
        self.perfil2.save(update_fields=["chave_pix"])

        self.client.credentials()
        r = self.client.get("/api/produtores/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        por_id = {p["id"]: p for p in r.data["results"]}
        self.assertTrue(por_id[self.perfil1.id]["aceita_pix"])
        self.assertFalse(por_id[self.perfil2.id]["aceita_pix"])
        self.assertNotIn("chave_pix", por_id[self.perfil1.id])

    def test_filtros_e_busca_de_produtos(self):
        self.client.credentials()  # anônimo
        # Busca por texto
        r = self.client.get("/api/produtos/?search=couve")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["count"], 1)

        # Busca inexistente
        r_inex = self.client.get("/api/produtos/?search=morangos")
        self.assertEqual(r_inex.data["count"], 0)

        # Filtro por tipo de produção
        r_tipo = self.client.get("/api/produtos/?tipo_producao=ORGANICO_CERTIFICADO")
        self.assertEqual(r_tipo.data["count"], 1)

    def test_produtor_so_edita_proprio_produto(self):
        # Produtor 2 tenta alterar produto do Produtor 1
        self.login("produtor2")
        r_edit = self.client.patch(
            f"/api/produtor/produtos/{self.produto1.id}/",
            {"nome": "Couve Invadida", "preco": "9.99"},
            format="json",
        )
        self.assertEqual(r_edit.status_code, status.HTTP_404_NOT_FOUND)

        # Produtor 1 edita com sucesso
        self.login("produtor1")
        r_ok = self.client.patch(
            f"/api/produtor/produtos/{self.produto1.id}/",
            {"preco": "3.50"},
            format="json",
        )
        self.assertEqual(r_ok.status_code, status.HTTP_200_OK)
        self.produto1.refresh_from_db()
        self.assertEqual(self.produto1.preco, Decimal("3.50"))

    def test_estatisticas_publicas(self):
        self.client.credentials()
        r = self.client.get("/api/estatisticas/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertIn("total_produtos", r.data)
        self.assertIn("total_produtores", r.data)

    def test_frontend_index_csp_e_health(self):
        self.client.credentials()
        res_home = self.client.get("/")
        self.assertEqual(res_home.status_code, status.HTTP_200_OK)
        self.assertIn('type="module"', res_home.content.decode("utf-8"))
        csp = res_home.headers.get("Content-Security-Policy", "")
        self.assertIn("script-src 'self'", csp)

        res_health = self.client.get("/api/health/")
        self.assertEqual(res_health.status_code, status.HTTP_200_OK)
        self.assertJSONEqual(res_health.content, {"status": "ok", "db": True})

    def test_upload_imagem_invalida_bloqueado(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.login("produtor1")
        arquivo_exe = SimpleUploadedFile("virus.exe", b"MZ123", content_type="application/octet-stream")
        r_ext = self.client.post(
            "/api/produtor/produtos/",
            {
                "nome": "Tomate",
                "preco": "5.00",
                "unidade_medida": "KG",
                "estoque": "10",
                "tipo_producao": "AGROECOLOGICO",
                "categoria": self.categoria.id,
                "imagem": arquivo_exe,
            },
            format="multipart",
        )
        self.assertEqual(r_ext.status_code, status.HTTP_400_BAD_REQUEST)

        arquivo_corrompido = SimpleUploadedFile("falso.png", b"nao-eh-imagem", content_type="image/png")
        r_corrupt = self.client.post(
            "/api/produtor/produtos/",
            {
                "nome": "Tomate",
                "preco": "5.00",
                "unidade_medida": "KG",
                "estoque": "10",
                "tipo_producao": "AGROECOLOGICO",
                "categoria": self.categoria.id,
                "imagem": arquivo_corrompido,
            },
            format="multipart",
        )
        self.assertEqual(r_corrupt.status_code, status.HTTP_400_BAD_REQUEST)
