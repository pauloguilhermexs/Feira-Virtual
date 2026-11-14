# 🌱 Feira Virtual — Plataforma de Venda Direta

Plataforma completa (Backend API + Frontend integrado) para conexão direta entre **produtores rurais da agricultura familiar**, **entregadores parceiros** e **compradores finais**, eliminando atravessadores e garantindo alimentos frescos com preço justo.

---

## 📌 Sumário

- [Visão Geral e Arquitetura](#-visão-geral-e-arquitetura)
- [Histórico de Atualizações Recentes](#-histórico-de-atualizações-recentes)
- [Como Rodar o Projeto](#-como-rodar-o-projeto)
  - [Opção 1: Inicialização Rápida (Recomendada)](#opção-1-inicialização-rápida-recomendada)
  - [Opção 2: Com Banco MySQL Local ou Docker](#opção-2-com-banco-mysql-local-ou-docker)
  - [Opção 3: Acesso Externo / Celular (via ngrok ou Cloudflare)](#opção-3-acesso-externo--celular-via-ngrok-ou-cloudflare)
- [Contas de Teste Pré-Configuradas](#-contas-de-teste-pré-configuradas)
- [Estrutura dos Módulos (Apps)](#-estrutura-dos-módulos-apps)
- [Principais Endpoints da API](#-principais-endpoints-da-api)
- [Decisões e Regras de Negócio](#-decisões-e-regras-de-negócio)
- [Design System & Frontend](#-design-system--frontend)

---

## 🏗 Visão Geral e Arquitetura

O sistema é composto por:
- **Backend:** Python + Django 6.x + Django REST Framework + SimpleJWT.
- **Frontend:** HTML5 semântico, CSS3 Moderno (Custom Properties) e Vanilla JavaScript, servido de forma unificada pelo próprio servidor Django na raiz (`/`).
- **Banco de Dados:** Híbrido e flexível — roda imediatamente com SQLite para desenvolvimento ágil ou com MySQL 8.x para produção, configurável apenas pelo arquivo `.env`.
- **Documentação de API:** Swagger interativo gerado automaticamente via `drf-spectacular`.

---

## 🚀 Histórico de Atualizações Recentes

Abaixo estão as principais melhorias implementadas no projeto:

### 1. Suporte Flexível a MySQL e SQLite
- **Driver PyMySQL integrado:** Configurado hook de inicialização em `config/__init__.py` com `pymysql.install_as_MySQLdb()`, eliminando a necessidade de compilação de pacotes nativos em C (`mysqlclient`) e evitando erros de instalação.
- **Alternância sem alterar código:** O motor de banco é escolhido via variável `DB_ENGINE` no `.env` (`DB_ENGINE=sqlite` para rodar sem banco externo ou `DB_ENGINE=mysql` para produção).

### 2. Segurança e Produção
- **CORS configurado:** Adicionado `django-cors-headers` com liberação de origens configurável.
- **Arquivos Estáticos com WhiteNoise:** Arquivos CSS, JS e do painel administrativo são compactados e cacheados eficientemente em produção sem necessidade de Nginx exclusivo.
- **Proteção contra Força Bruta (Throttling):** Rate limiting no DRF (100 req/min para anônimos e 1000 req/min para autenticados).
- **Compatibilidade com Proxy Reverso e HTTPS:** Configurados `SECURE_PROXY_SSL_HEADER`, `USE_X_FORWARDED_HOST` e `CSRF_TRUSTED_ORIGINS` para aceitar domínios de nuvem e túneis HTTPS sem erro 403 CSRF.
- **Upload de Mídia:** Adicionados campos `ImageField` para fotos de produtos e fotos das propriedades rurais.

### 3. Frontend Completo Integrado na Raiz (`/`)
- **Single-Server:** O próprio Django agora serve a interface na rota principal `http://127.0.0.1:8000/`.
- **Paleta de Cores e Psicologia das Cores:** Baseada na regra 60-30-10:
  - **60%** Fundos neutros (Off-white / Dark deep green).
  - **30%** Verde Terra (`#3D8B37`) para cabeçalho, estrutura e identidade visual.
  - **10%** Âmbar Vibrante (`#F59E0B`) restrito a botões de ação (CTA) e conversão.
- **Light e Dark Mode:** Alternância com 1 clique e persistência de preferência no `localStorage`.
- **Catálogo Conectado em Tempo Real:** Listagem dinâmica via `GET /api/produtos/`, busca instantânea com debounce e filtros de categoria e tipo de cultivo (Orgânico, Agroecológico, Convencional).
- **Carrinho e Checkout Integrados:** Drawer lateral que consome `/api/carrinho/`, permite adicionar itens, alterar quantidades e submeter pedidos (`POST /api/pedidos/`).
- **Autenticação Visual:** Modais de Login e Cadastro conectados aos endpoints JWT com botões de preenchimento rápido para testes.

---

## 💻 Como Rodar o Projeto

### Opção 1: Inicialização Rápida (Recomendada)

O projeto já vem com arquivo `.env` configurado em modo SQLite e dados de teste pré-carregados (produtos, categorias e usuários).

```bash
# 1. Acesse a pasta do projeto
cd ~/Downloads/feira_virtual

# 2. Ative o ambiente virtual
source .venv/bin/activate

# 3. Inicie o servidor
python manage.py runserver
```

Abra no seu navegador:
- **Interface da Feira (Frontend):** [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Documentação da API (Swagger):** [http://127.0.0.1:8000/api/docs/](http://127.0.0.1:8000/api/docs/)
- **Painel Administrativo:** [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/)

---

### Opção 2: Com Banco MySQL Local ou Docker

Quando desejar utilizar o MySQL como banco oficial:

#### Via Docker Compose (Mais simples):
```bash
# Sobe o MySQL 8.4 em container
docker compose up db -d
```

#### No MySQL Local instalado:
```sql
CREATE DATABASE IF NOT EXISTS feira_virtual CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'feira'@'%' IDENTIFIED BY 'feira123';
GRANT ALL PRIVILEGES ON feira_virtual.* TO 'feira'@'%';
FLUSH PRIVILEGES;
```

No arquivo `.env`, altere:
```env
DB_ENGINE=mysql
DB_NAME=feira_virtual
DB_USER=feira
DB_PASSWORD=feira123
DB_HOST=127.0.0.1
DB_PORT=3306
```

E execute as migrações:
```bash
python manage.py migrate
python manage.py runserver
```

---

### Opção 3: Acesso Externo / Celular (via ngrok ou Cloudflare)

Para acessar a Feira Virtual pelo celular ou compartilhar com outras pessoas sem expor portas do seu roteador:

1. **Terminal 1:** Deixe o Django rodando normalmente:
   ```bash
   python manage.py runserver
   ```

2. **Terminal 2:** Inicie o túnel ngrok na mesma porta:
   ```bash
   ngrok http 8000
   ```
   *(Ou usando Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:8000`)*

3. Copie a URL pública gerada (ex: `https://xxxx.ngrok-free.app`) e abra no celular. O Django já está configurado para aceitar requisições externas sem erro de CSRF.

---

## 👥 Contas de Teste Pré-Configuradas

Para facilitar a experimentação das funcionalidades, o banco já inclui contas de demonstração:

| Perfil | Usuário | Senha | O que pode fazer |
|---|---|---|---|
| **Cliente** | `cliente_teste` | `Cliente123!` | Adicionar itens ao carrinho, simular checkout e fazer avaliações |
| **Produtor** | `sitio_esperanca` | `Produtor123!` | Gerenciar produtos, aceitar/recusar pedidos e ver vendas |
| **Administrador** | `paulo` | `Senha-Forte-123` | Acesso completo ao painel Django Admin (`/admin/`) e moderação |

> *Dica: No modal de login do frontend, existem atalhos de preenchimento em 1 clique para essas contas.*

---

## 📦 Estrutura dos Módulos (Apps)

```
feira_virtual/
├── avaliacoes/    # Avaliações de produtos, produtores e registro de reclamações
├── catalogo/      # Categorias, produtos, unidades de medida e tipos de cultivo
├── config/        # Configurações do Django (settings, URLs, WSGI)
├── frontend/      # Arquivos do frontend (index.html, style.css, main.js)
├── painel/        # Endpoints administrativos, indicadores e métricas da feira
├── pedidos/       # Carrinho, checkout, máquina de estados de pedidos e estoque
└── usuarios/      # Usuários (4 perfis), endereços e autenticação JWT
```

---

## 🔌 Principais Endpoints da API

### Autenticação & Perfil
- `POST /api/auth/login/` — Retorna tokens JWT (`access` e `refresh`).
- `POST /api/auth/registro/cliente/` — Cadastro de comprador.
- `POST /api/auth/registro/produtor/` — Cadastro de produtor rural.
- `POST /api/auth/registro/entregador/` — Cadastro de entregador parceiro.
- `GET/PATCH /api/perfil/` — Consulta e edição dos dados da conta autenticada.

### Catálogo de Produtos
- `GET /api/categorias/` — Lista categorias ativas.
- `GET /api/produtos/` — Lista produtos públicos com filtros (`?search=`, `?categoria=`, `?tipo_producao=`, `?ordering=`).
- `POST /api/produtor/produtos/` — Cadastro de novo produto pelo produtor.

### Carrinho & Pedidos
- `GET /api/carrinho/` — Consulta itens e total do carrinho do cliente.
- `POST /api/carrinho/itens/` — Adiciona produto ao carrinho.
- `PATCH /api/carrinho/itens/{id}/` — Atualiza quantidade.
- `DELETE /api/carrinho/itens/{id}/` — Remove item.
- `POST /api/pedidos/` — Finaliza o carrinho criando pedidos por produtor.
- `GET /api/pedidos/` — Lista pedidos do cliente.
- `POST /api/produtor/pedidos/{id}/aceitar/` — Produtor aceita o pedido e baixa estoque.
- `POST /api/entregas/{id}/confirmar/` — Entregador confirma entrega do pedido.

---

## ⚖️ Decisões e Regras de Negócio

1. **Separação por Produtor:** O carrinho pode conter itens de produtores distintos; no momento do checkout, o sistema divide automaticamente a compra em um pedido independente para cada produtor rural.
2. **Controle Estrito de Estoque:** O estoque é validado na inserção ao carrinho e no checkout. A baixa efetiva do estoque ocorre quando o produtor **aceita** o pedido. Se o pedido for cancelado ou recusado, o estoque é estornado automaticamente de forma transacional.
3. **Moderação de Produtores:** Novos produtores iniciam com status `PENDENTE`. Seus produtos só ficam visíveis no catálogo público após aprovação de um Administrador.
4. **Formas de Pagamento Dinâmicas:** Cada produtor define suas opções aceitas (Pix, Cartão com maquininha própria ou Dinheiro). O checkout valida e bloqueia opções incompatíveis.
5. **Histórico Imutável:** Ao fechar o pedido, os preços unitários e nomes dos produtos são copiados para a tabela `ItemPedido`, garantindo que alterações futuras no catálogo não modifiquem pedidos passados.

---

## 🎨 Design System & Frontend

O frontend segue especificações modernas de usabilidade e acessibilidade (WCAG 2.1 AA):
- **Tipografia:** `Inter` para legibilidade de dados e interface; `Fraunces` (serif) para títulos e destaques acolhedores.
- **Componentes:** Carrinho lateral (Drawer) em CSS puro, modais acessíveis com foco visível, toasts de notificação assíncronos e badges de status.
- **Tokens CSS:** Variáveis customizáveis centralizadas no topo de `frontend/style.css`.
