# Feira Virtual — API (Django + Django REST Framework)

Plataforma de venda direta de produtores rurais (agricultura familiar) com 4 perfis:
cliente, produtor rural, entregador e administrador.

## Como rodar (Linux)

### 1. Banco de dados (MySQL)

Certifique-se de que o MySQL está em execução. Você pode usar seu servidor MySQL local ou subir via Docker:

```bash
docker compose up -d
```

No MySQL, crie o banco de dados (caso não use o docker compose, que já cria automaticamente):

```sql
CREATE DATABASE feira_virtual CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Copie o arquivo de exemplo de variáveis de ambiente e ajuste usuário/senha caso necessário:

```bash
cp .env.example .env
```

### 2. Ambiente e dependências

```bash
cd feira_virtual
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python manage.py migrate
python manage.py createsuperuser      # vira automaticamente o perfil ADMIN
python manage.py runserver
```

- Documentação interativa (Swagger): http://127.0.0.1:8000/api/docs/
- Painel Django admin: http://127.0.0.1:8000/admin/
- Testes: `python manage.py test` (ou `DB_ENGINE=sqlite python manage.py test` para rodar testes com SQLite isolado)

Autenticação: JWT. Faça `POST /api/auth/login/` e envie `Authorization: Bearer <access>`.
Em desenvolvimento, o e-mail de recuperação de senha aparece no terminal do servidor.

## Estrutura

| App | Conteúdo | Módulo do PDF |
|---|---|---|
| `usuarios` | Usuário (4 tipos), perfil do produtor/propriedade, perfil do entregador, endereços, login/logout/recuperação de senha | 1 |
| `catalogo` | Categorias, produtos (unidade de medida, tipo de produção), busca e filtros | 2 |
| `pedidos` | Carrinho, checkout, pedidos, estoque, entregas, pagamento | 3, 4, 5 |
| `avaliacoes` | Avaliações de produtos/produtores e reclamações | 5, 6 |
| `painel` | Endpoints do administrador e indicadores | 6 |

## Principais endpoints

**Autenticação / perfil** — `POST /api/auth/registro/{cliente|produtor|entregador}/`, `auth/login/`, `auth/refresh/`,
`auth/logout/`, `auth/recuperar-senha/`, `auth/redefinir-senha/`, `GET/PATCH /api/perfil/`,
`/api/perfil/produtor/`, `/api/perfil/entregador/`, `/api/enderecos/`

**Catálogo** — `GET /api/categorias/`, `GET /api/produtos/?search=&categoria=&tipo_producao=&ordering=preco`,
produtor: `/api/produtor/produtos/` (CRUD)

**Cliente** — `GET /api/carrinho/`, `POST /api/carrinho/itens/`, `PATCH|DELETE /api/carrinho/itens/{id}/`,
`POST /api/pedidos/` (checkout), `GET /api/pedidos/`, `POST /api/pedidos/{id}/cancelar/`,
`POST /api/avaliacoes/`, `POST /api/reclamacoes/`

**Produtor** — `GET /api/produtor/pedidos/`, `POST .../{id}/aceitar|recusar/`, `POST .../{id}/status/`,
`GET /api/produtor/pedidos/vendas/`, `GET /api/produtor/avaliacoes/`

**Entregador** — `GET /api/entregas/?escopo=disponiveis|minhas`, `POST /api/entregas/{id}/aceitar/`,
`.../saiu-para-entrega/`, `.../confirmar/`

**Administrador** (`/api/admin/`) — `usuarios/` (+`bloquear`/`reativar`), `produtores/` (+`aprovar`/`suspender`),
`produtos/` (+`ocultar`/`reexibir`), `pedidos/`, `reclamacoes/`, `indicadores/`; categorias em `/api/categorias/`.

## Decisões de projeto

- **Um pedido por produtor:** o carrinho pode ter itens de vários produtores; no checkout ele é dividido em um pedido para cada um.
- **Estoque:** validado ao adicionar ao carrinho e no checkout; **baixado quando o produtor aceita** o pedido ("confirmação") e devolvido se for cancelado/recusado depois.
- **Vendas:** só pedidos `CONCLUIDO` contam; cancelados e recusados ficam fora.
- **Pagamento:** Pix / cartão / dinheiro. O produtor cadastra chave Pix, se tem maquininha e se aceita dinheiro; o checkout recusa formas que ele não aceita.
- **Aprovação:** produtor `PENDENTE` pode cadastrar produtos, mas eles só aparecem no catálogo após a aprovação do administrador.
- **Histórico do pedido:** preços e nomes são copiados para `ItemPedido`, então mudar ou excluir o produto não altera pedidos antigos.

## Próximos passos sugeridos

Upload de imagens (Pillow + `ImageField`), PostgreSQL, CORS (`django-cors-headers`) para o front-end,
envio real de e-mail, taxa de frete, notificações para os usuários.
