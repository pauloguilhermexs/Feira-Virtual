from decimal import Decimal

from rest_framework.test import APITestCase

from catalogo.models import Categoria, Produto
from usuarios.models import Usuario

PW = "Senha-Forte-123"


class FluxoCompletoTest(APITestCase):
    def registrar(self, tipo, username, **extra):
        r = self.client.post(f"/api/auth/registro/{tipo}/", {
            "username": username, "email": f"{username}@ex.com", "password": PW,
            "first_name": username.title(), **extra}, format="json")
        self.assertEqual(r.status_code, 201, r.data)

    def login(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": PW}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return r.data

    def setUp(self):
        Usuario.objects.create_superuser("admin", "admin@ex.com", PW)
        self.registrar("produtor", "maria", nome_propriedade="Sítio Esperança", chave_pix="maria@pix",
                       possui_maquininha=False)
        self.registrar("cliente", "joao")
        self.registrar("entregador", "zeca", veiculo="Moto")
        self.cat = Categoria.objects.create(nome="Hortaliças")

    def test_fluxo(self):
        # produtor cadastra produto (ainda pendente de aprovação → invisível no catálogo)
        self.login("maria")
        r = self.client.post("/api/produtor/produtos/", {
            "nome": "Alface", "preco": "3.50", "unidade_medida": "MACO", "estoque": "10",
            "tipo_producao": "AGROECOLOGICO", "categoria": self.cat.id}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        pid = r.data["id"]
        self.client.credentials()
        self.assertEqual(self.client.get("/api/produtos/").data["count"], 0)

        # admin aprova → aparece no catálogo, com busca e filtro
        self.login("admin")
        prod_id = self.client.get("/api/admin/produtores/").data["results"][0]["id"]
        self.assertEqual(self.client.post(f"/api/admin/produtores/{prod_id}/aprovar/").status_code, 200)
        self.client.credentials()
        self.assertEqual(self.client.get("/api/produtos/?search=alf").data["count"], 1)
        self.assertEqual(self.client.get("/api/produtos/?tipo_producao=CONVENCIONAL").data["count"], 0)

        # cliente: carrinho
        self.login("joao")
        r = self.client.post("/api/carrinho/itens/", {"produto": pid, "quantidade": "11"}, format="json")
        self.assertEqual(r.status_code, 400)  # acima do estoque
        r = self.client.post("/api/carrinho/itens/", {"produto": pid, "quantidade": "4"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        item = r.data["id"]
        self.client.patch(f"/api/carrinho/itens/{item}/", {"quantidade": "5"}, format="json")
        self.assertEqual(Decimal(self.client.get("/api/carrinho/").data["total"]), Decimal("17.50"))

        # checkout: sem endereço falha; cartão não aceito; pix ok
        base = {"modalidade": "ENTREGA", "forma_pagamento": "PIX"}
        self.assertEqual(self.client.post("/api/pedidos/", base, format="json").status_code, 400)
        end = self.client.post("/api/enderecos/", {"logradouro": "Rua A", "numero": "10", "bairro": "Centro",
                                                    "cidade": "Natal", "estado": "RN"}, format="json").data["id"]
        r = self.client.post("/api/pedidos/", {**base, "forma_pagamento": "CARTAO", "endereco_id": end}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/pedidos/", {**base, "endereco_id": end}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        pedido = r.data[0]["id"]
        self.assertEqual(self.client.post("/api/pedidos/", {**base, "endereco_id": end}, format="json").status_code, 400)  # carrinho vazio

        # não pode avaliar antes de comprar
        r = self.client.post("/api/avaliacoes/", {"produto": pid, "nota": 5}, format="json")
        self.assertEqual(r.status_code, 400)

        # produtor aceita → estoque baixa; outro produtor não poderia mexer
        self.login("maria")
        self.assertEqual(self.client.post(f"/api/produtor/pedidos/{pedido}/aceitar/").status_code, 200)
        self.assertEqual(Produto.objects.get(pk=pid).estoque, Decimal("5"))
        self.client.post(f"/api/produtor/pedidos/{pedido}/status/", {"status": "EM_PREPARO"}, format="json")
        r = self.client.post(f"/api/produtor/pedidos/{pedido}/status/", {"status": "PRONTO"}, format="json")
        self.assertEqual(r.data["status"], "PRONTO")
        # produtor não conclui pedido com entrega
        r = self.client.post(f"/api/produtor/pedidos/{pedido}/status/", {"status": "CONCLUIDO"}, format="json")
        self.assertEqual(r.status_code, 400)

        # entregador
        self.login("zeca")
        self.assertEqual(self.client.get("/api/entregas/").data["count"], 1)
        self.assertEqual(self.client.post(f"/api/entregas/{pedido}/aceitar/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/entregas/{pedido}/saiu-para-entrega/").data["status"], "EM_ENTREGA")
        self.assertEqual(self.client.post(f"/api/entregas/{pedido}/confirmar/").data["status"], "CONCLUIDO")

        # cliente avalia; não duplica
        self.login("joao")
        self.assertEqual(self.client.post("/api/avaliacoes/", {"produto": pid, "nota": 5, "comentario": "Fresquinha"},
                                          format="json").status_code, 201)
        self.assertEqual(self.client.post("/api/avaliacoes/", {"produto": pid, "nota": 4}, format="json").status_code, 400)
        self.client.credentials()
        self.assertEqual(self.client.get("/api/produtos/").data["results"][0]["nota_media"], 5.0)

        # produtor vê vendas; admin vê indicadores
        self.login("maria")
        self.assertEqual(Decimal(str(self.client.get("/api/produtor/pedidos/vendas/").data["faturamento"])), Decimal("17.50"))
        self.login("admin")
        self.assertEqual(self.client.get("/api/admin/indicadores/").data["vendas_concluidas"], 1)

    def test_cancelamento_devolve_estoque_e_permissoes(self):
        Usuario.objects.get(username="maria").perfil_produtor.__class__.objects.update(status="APROVADO")
        perfil = Usuario.objects.get(username="maria").perfil_produtor
        p = Produto.objects.create(produtor=perfil, categoria=self.cat, nome="Mel", preco="20", estoque="3",
                                   unidade_medida="UNIDADE")
        self.login("joao")
        self.client.post("/api/carrinho/itens/", {"produto": p.id, "quantidade": "2"}, format="json")
        pedido = self.client.post("/api/pedidos/", {"modalidade": "RETIRADA", "forma_pagamento": "DINHEIRO"},
                                  format="json").data[0]["id"]
        self.login("maria")
        self.client.post(f"/api/produtor/pedidos/{pedido}/aceitar/")
        p.refresh_from_db(); self.assertEqual(p.estoque, Decimal("1"))
        self.login("joao")
        self.assertEqual(self.client.post(f"/api/pedidos/{pedido}/cancelar/").data["status"], "CANCELADO")
        p.refresh_from_db(); self.assertEqual(p.estoque, Decimal("3"))
        # cliente não acessa área do produtor/admin; produtor não cadastra categoria
        self.assertEqual(self.client.get("/api/produtor/pedidos/").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/usuarios/").status_code, 403)
        self.login("maria")
        self.assertEqual(self.client.post("/api/categorias/", {"nome": "X"}, format="json").status_code, 403)

    def test_logout_e_recuperacao_de_senha(self):
        tokens = self.login("joao")
        r = self.client.post("/api/auth/logout/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(r.status_code, 204)
        r = self.client.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(r.status_code, 401)
        from django.core import mail
        self.client.credentials()
        self.client.post("/api/auth/recuperar-senha/", {"email": "joao@ex.com"}, format="json")
        corpo = mail.outbox[0].body
        uid = corpo.split("uid: ")[1].split()[0]
        token = corpo.split("token: ")[1].split()[0]
        r = self.client.post("/api/auth/redefinir-senha/", {"uid": uid, "token": token, "nova_senha": "OutraSenha-987"},
                             format="json")
        self.assertEqual(r.status_code, 200, r.data)
