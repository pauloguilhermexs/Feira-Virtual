<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/assets/logo-horizontal-white.png" />
    <source media="(prefers-color-scheme: light)" srcset="frontend/assets/logo-horizontal.png" />
    <img src="frontend/assets/logo-horizontal.png" alt="Logo Feira Virtual" width="260" />
  </picture>
</p>

<h1 align="center">Feira Virtual — Plataforma de Venda Direta</h1>

<p align="center">
  <strong>Disciplina:</strong> Engenharia de Software &nbsp;|&nbsp; <strong>Código:</strong> DCA3603<br />
  <strong>Integrantes:</strong><br />
  Débora Nicolly Araújo da Silva · Douglas Amon Passos dos Anjos<br />
  Caio de Miranda Silva · Paulo Guilherme Xavier da Silva
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white" alt="Python 3.12" />
  <img src="https://img.shields.io/badge/Django-6.1-092E20?style=flat&logo=django&logoColor=white" alt="Django 6.1" />
  <img src="https://img.shields.io/badge/DRF-3.18-A30000?style=flat&logo=django&logoColor=white" alt="DRF 3.18" />
  <img src="https://img.shields.io/badge/Auth-SimpleJWT-000000?style=flat&logo=jsonwebtokens&logoColor=white" alt="SimpleJWT" />
  <img src="https://img.shields.io/badge/Banco-MySQL%208.4%20%7C%20SQLite-4479A1?style=flat&logo=mysql&logoColor=white" alt="MySQL 8.4 e SQLite" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker Compose" />
  <img src="https://img.shields.io/badge/Testes-104%20aprovados-246F11?style=flat" alt="104 testes aprovados" />
  <a href="https://github.com/pauloguilhermexs/Feira-Virtual/actions/workflows/ci.yml"><img src="https://github.com/pauloguilhermexs/Feira-Virtual/actions/workflows/ci.yml/badge.svg?branch=dev" alt="CI — Feira Virtual" /></a>
</p>

**Sumário:** [1. Princípios](#1-princípios-de-projeto-e-engenharia-de-software) · [2. Proposta, Motivação e ODS](#2-apresentação-motivação-e-ods) · [3. Padrões de Projeto](#3-padrões-de-projeto-aplicados) · [4. Critérios de Avaliação](#4-critérios-de-avaliação-e-evidências) ([4.1 Docker](#41-projeto-conteinerizado) · [4.2 API](#42-api-com-os-principais-requisitos) · [4.3 Auth](#43-autenticação-e-autorização) · [4.4 Testes/CI](#44-ci-e-testes) · [4.5 Front-End](#45-front-end-e-demonstração)) · [5. Arquitetura, Tecnologias e Diretórios](#5-arquitetura-tecnologias-e-diretórios) · [6. Execução Local e Variáveis](#6-execução-local-sem-docker-e-variáveis) · [7. Considerações Finais](#7-considerações-finais)

---

## 1. Princípios de Projeto e Engenharia de Software

| Princípio | Importância | Evidência na Feira Virtual |
|---|---|---|
| **Modularidade** | Fronteiras claras entre subdomínios. | 5 apps Django (`usuarios`, `catalogo`, `pedidos`, `avaliacoes`, `painel`) + `config` e 10 ES Modules (`frontend/`). |
| **Separação de responsabilidades** | Isola HTTP, validação e regras de negócio. | Views (`*/views.py`), serializers (`*/serializers.py`) e camada transacional em [`pedidos/services.py`](pedidos/services.py). |
| **Baixo acoplamento** | Facilita troca de provedores sem alterar o núcleo. | Contratos abstratos em `pedidos/pix.py` e `pedidos/notificacoes.py`; UI desacoplada via `/api/` (`api.js`). |
| **Alta coesão** | Agrupa modelos, rotas e testes do mesmo domínio. | Cada app concentra seus próprios `models.py`, `serializers.py`, `views.py`, `urls.py`, `test_unit.py` e `tests.py`. |
| **Reutilização de código** | Evita duplicação com abstrações comuns. | Base `_PorTipo` (`usuarios/permissions.py`), `mudar_status()` (`services.py`), `apiFetch()` e `renderIcon()` (`frontend/js/`). |
| **Manutenibilidade** | Reduz risco de regressão em evoluções. | 104 testes automatizados (62 de unidade + 42 de integração), logs estruturados, `LogAuditoria` (`painel/models.py`) e histórico Git semântico. |
| **Segurança** | Protege dados e operações conforme o perfil. | RBAC + filtro anti-IDOR, CSP (`config/middleware.py`), anti-*Path Traversal* (`config/urls.py`), throttles, Pillow e LGPD. |
| **Escalabilidade** | Suporta crescimento de dados e tráfego. | Paginação (`PAGE_SIZE = 20`), índices, `select_related`/`prefetch_related`, Gunicorn, WhiteNoise e MySQL 8.4 *(mídia em `/media/` exigiria S3/R2 em múltiplas réplicas)*. |

---

## 2. Apresentação, Motivação e ODS

A **Feira Virtual** conecta **produtores da agricultura familiar**, **consumidores**, **entregadores parceiros** e **administradores** em um único ambiente web para venda direta — integrando catálogo, carrinho com separação automática por produtor, controle transacional de estoque, entregas, avaliações pós-compra e moderação.

- **Motivação:** enfrentar baixa visibilidade comercial de pequenos produtores, dependência de intermediários, distanciamento campo–cidade e desorganização manual de pedidos, estoques e entregas.
- **Objetivos:** viabilizar comercialização direta e transparente (preço, estoque, cultivo orgânico/agroecológico/convencional, formas de pagamento), organizar pedidos/entregas e oferecer workspaces específicos por perfil.
- **Alinhamento aos ODS ([Agenda 2030 — ONU Brasil](https://brasil.un.org/pt-br/sdgs)):** o software foi pensado considerando os Objetivos de Desenvolvimento Sustentável — em especial o **[ODS 2](https://brasil.un.org/pt-br/sdgs/2)** (*Fome Zero e Agricultura Sustentável*), o **[ODS 8](https://brasil.un.org/pt-br/sdgs/8)** (*Trabalho Decente e Crescimento Econômico*) e o **[ODS 12](https://brasil.un.org/pt-br/sdgs/12)** (*Consumo e Produção Responsáveis*), ao buscar ampliar o acesso de agricultores familiares ao mercado, apoiar o trabalho local e organizar pedidos e estoques. *(Contribuições potenciais esperadas em escopo acadêmico, sem resultados empíricos ou medição direta de desperdício.)*

---

## 3. Padrões de Projeto Aplicados

Distingue-se **Padrões GoF** (`Strategy`, `Adapter`, `Template Method`, `Facade`), **Padrão Arquitetural** (`Service Layer` sobre *Monólito Modular*) e **boas práticas** (snapshot `ItemPedido`, *soft delete* com `LogAuditoria`, `select_for_update()` e middleware CSP):

| Padrão | Tipo | Objetivo | Aplicação e Evidência | Benefícios |
|---|---|---|---|---|
| **Service Layer** | Arquitetural | Isolar regras de domínio e transações das views HTTP. | [`pedidos/services.py`](pedidos/services.py): `finalizar_carrinho()`, `mudar_status()`, `validar_pagamento()`, `_baixar_estoque()`, `_devolver_estoque()`, `TRANSICOES`. | Atomicidade (`@transaction.atomic` + `select_for_update()`) e reuso único entre perfis. |
| **Strategy** (+ Factory) | GoF Comportamental | Desacoplar pedidos dos provedores de pagamento Pix e notificações. | [`pedidos/pix.py`](pedidos/pix.py) (`GatewayPixBase`, `MockPixGateway`, `obter_gateway_pix()`) e [`pedidos/notificacoes.py`](pedidos/notificacoes.py) (`NotificadorBase`, `NotificadorEmail`, `NotificadorWhatsApp`, `CentralNotificacoes`). | Permite plugar gateways reais sem mexer no domínio e isola falhas por canal. |
| **Adapter** | GoF Estrutural | Compatibilizar `PyMySQL` com a interface `MySQLdb` do Django. | [`config/__init__.py`](config/__init__.py) (`pymysql.install_as_MySQLdb()`) e [`entrypoint.sh`](entrypoint.sh). | Elimina `gcc`/`mysqlclient` no Docker e alterna SQLite ↔ MySQL via `.env`. |
| **Template Method** | GoF Comportamental | Evitar repetição da verificação de perfil nas permissões DRF. | [`usuarios/permissions.py`](usuarios/permissions.py): `_PorTipo.has_permission()` herdado por `EhCliente`, `EhProdutor`, `EhEntregador` e `EhAdmin`. | Controle RBAC declarativo e uniforme. |
| **Facade** | GoF Estrutural | Centralizar Bearer JWT, fila de refresh `401` e parse de erros no JS. | [`frontend/js/api.js`](frontend/js/api.js): `apiFetch()`, `refreshAccessToken()`, `processQueue()`, `tokens`, `parseError()`. | Desacopla os 8 módulos de tela do HTTP e evita *race condition* no refresh. |

> **Simulações:** `MockPixGateway` (`"simulado": True`) e `NotificadorWhatsApp` (`[WHATSAPP MOCK]`) são simulados; `NotificadorEmail` usa `console.EmailBackend` em dev (SMTP configurável via `EMAIL_*`).

---

## 4. Critérios de Avaliação e Evidências

### 4.1. Projeto Conteinerizado

- **[`Dockerfile`](Dockerfile):** `python:3.12-slim`, usuário não-root `appuser` (`HOME=/home/appuser`), `PyMySQL` sem `gcc`, WhiteNoise (`collectstatic`), `HEALTHCHECK` em `/api/health/` e **Gunicorn** (`3 workers`).
- **[`docker-compose.yml`](docker-compose.yml) e [`entrypoint.sh`](entrypoint.sh):** orquestra `db` (**MySQL 8.4**, volume `mysql_data`, porta `127.0.0.1:3306:3306`, `healthcheck` com `MYSQL_PWD`) e `web` (`DB_HOST: db`, volume `media_data`, porta `8000:8000`), com espera ativa do banco e `migrate --noinput` no boot.

```bash
cp .env.example .env            # defina DJANGO_SECRET_KEY e senhas
docker compose up --build -d    # sobe MySQL 8.4 + Django e aplica migrações
docker compose ps               # valida saúde dos serviços (up db -d sobe só o banco)
docker compose logs -f web      # acompanha logs | docker compose down encerra mantendo volumes
```

### 4.2. API com os Principais Requisitos

API REST em **Django REST Framework** (JSON / `multipart` validado com Pillow, `PAGE_SIZE = 20`, busca, filtros e ordenação). Swagger UI em `http://127.0.0.1:8000/api/docs/` e schema em `/api/schema/` *(restritos a admin; `ENABLE_SWAGGER=1` libera localmente)*. Cobrança Pix em `/api/pedidos/{id}/pix/` é simulada (`MockPixGateway`, `"simulado": true`).

| Módulo | Principais Endpoints REST |
|---|---|
| **Usuários & LGPD** (`usuarios/urls.py`) | `POST /api/auth/registro/{cliente,produtor,entregador}/` · `POST /api/auth/{login,refresh,logout,recuperar-senha,redefinir-senha}/` · `GET/PATCH /api/perfil/` (`/produtor/`, `/entregador/`) · `CRUD /api/enderecos/` · `GET /api/perfil/exportar-dados/` · `DELETE /api/perfil/excluir-conta/` |
| **Catálogo** (`catalogo/urls.py`) | `CRUD /api/categorias/` · `GET /api/produtos/` (`?search=`, `?categoria=`, `?tipo_producao=`, `?produtor=`, `?ordering=`, `?page=`) · `GET /api/produtores/` · `GET /api/estatisticas/` · `CRUD /api/produtor/produtos/` |
| **Pedidos & Pix** (`pedidos/urls.py`) | `GET/DELETE /api/carrinho/` · `POST/PATCH/DELETE /api/carrinho/itens/` · `POST/GET /api/pedidos/` · `POST /api/pedidos/{id}/cancelar/` · `GET /api/pedidos/{id}/pix/` · `POST /api/pedidos/pix/webhook/` · `GET/POST /api/produtor/pedidos/` (`/{id}/aceitar/`, `/recusar/`, `/status/`, `/vendas/`, `/resumo/`) |
| **Entregas** (`pedidos/urls.py`) | `GET /api/entregas/?escopo=disponiveis\|minhas\|historico` · `GET /api/entregas/resumo/` · `POST /api/entregas/{id}/{aceitar,saiu-para-entrega,confirmar}/` |
| **Avaliações** (`avaliacoes/urls.py`) | `CRUD /api/avaliacoes/` · `GET /api/avaliacoes/minhas/` · `GET /api/produtor/avaliacoes/` · `GET/POST /api/produtor/avaliacoes-clientes/` · `GET/POST /api/reclamacoes/` |
| **Admin & Sistema** (`painel/urls.py`, `config/urls.py`) | `GET /api/admin/indicadores/` · `/api/admin/{usuarios,produtores,produtos,pedidos,reclamacoes,avaliacoes,avaliacoes-clientes}/` · `GET /api/config/` · `GET /api/health/` · `/api/schema/` · `/api/docs/` |

### 4.3. Autenticação e Autorização

- **Autenticação (`SimpleJWT`):** tokens `access` (`1h`) e `refresh` (`7d`), `token_blacklist`, throttles dedicados (`login`: `10/min`; `registro`/`recuperar_senha`: `5/min`), recuperação com resposta neutra e `LogoutView` validando posse do token (`403` para terceiros). `CsrfViewMiddleware` e cookies `HttpOnly`/`Secure` (`SECURE_SSL_REDIRECT=1`) protegem `SessionAuthentication` (Admin); no frontend ([`api.js`](frontend/js/api.js)), o JWT fica em `localStorage` sob CSP estrita (`script-src 'self'`) com `ROTATE_REFRESH_TOKENS = False` (migração para cookies `HttpOnly` e rotação mapeada como melhoria).
- **Autorização (RBAC + Anti-IDOR):** padrão *default-deny* (`IsAuthenticated`), classes [`usuarios/permissions.py`](usuarios/permissions.py) (`EhCliente`, `EhProdutor`, `EhEntregador`, `EhAdmin`, `AdminEscreveTodosLeem`) e `get_queryset()` filtrado pelo titular:

| Perfil | Permissões e Restrições |
|---|---|
| **Cliente** (`EhCliente`) | Compra, gerencia carrinho/endereços, acompanha/cancela próprios pedidos, avalia após conclusão e abre reclamações. |
| **Produtor Rural** (`EhProdutor`) | Gerencia propriedade, produtos, pedidos recebidos, vendas e avaliação recíproca; não reverte `oculto_moderacao`. |
| **Entregador** (`EhEntregador`) | Vê endereço resumido antes do aceite; segue `PRONTO → EM_ENTREGA → CONCLUIDO` apenas em entregas próprias. |
| **Administrador** (`EhAdmin`) | Gerencia usuários, aprova/suspende produtores, modera catálogo/reclamações/avaliações e audita via `LogAuditoria`. |

### 4.4. CI e Testes

A suíte reúne **104 testes automatizados aprovados** (**92%** de cobertura medida via `coverage`), separados em **Testes de Unidade (62)** e **Testes de Integração (42)**.

#### Testes de Unidade (62 testes — `*/test_unit.py`)

**Como foram feitos:** escritos com `SimpleTestCase` (sem banco de dados para funções puras, permissões e mocks) e `TestCase`, utilizando **`APIRequestFactory`** do Django REST Framework, chamadas diretas a **serializers**, **permissões**, **validadores**, **middleware** e **funções de serviço**, além de `unittest.mock` e `override_settings` para isolar banco, e-mail, logs e variáveis de ambiente.

| Módulo | Qtd. | O que os testes se propõem a verificar |
|---|---|---|
| [`config/test_unit.py`](config/test_unit.py) | 12 | `validar_imagem_upload()` (tamanho > 5 MB, extensões proibidas, binário corrompido via Pillow e reset de ponteiro), `ContentSecurityPolicyMiddleware` (CSP padrão, Swagger e preservação de header existente) e views auxiliares (`health_view` 200/503, sanitização de frete negativo em `config_publica_view` e bloqueio de *path traversal* em assets/mídia). |
| [`usuarios/test_unit.py`](usuarios/test_unit.py) | 11 | Matriz completa de permissões RBAC DRF (`EhCliente`, `EhProdutor`, `EhEntregador`, `EhAdmin`, `AdminEscreveTodosLeem` para métodos seguros/escrita e anônimos), `_obter_ip()` (`X-Forwarded-For` vs. `REMOTE_ADDR`), `Endereco.como_texto()`, `Usuario.save()` (superuser força `ADMIN`) e proteção `read_only`/força de senha/criação atômica nos serializers de usuário e registro. |
| [`catalogo/test_unit.py`](catalogo/test_unit.py) | 6 | `ProdutorPublicoSerializer` (`get_cidade_uf()`, `get_aceita_pix()` e não exposição de `chave_pix`), `ProdutoProdutorSerializer` (`validate_categoria()` inativa, `validate_imagem()` e proteção `read_only` de `oculto_moderacao`) e `full_clean()` de `Produto` (preço mínimo e estoque não negativo). |
| [`pedidos/test_unit.py`](pedidos/test_unit.py) | 24 | `gerar_numero_publico()`, `total_com_frete`, subtotais decimais, `_resumir_endereco_entregador()`, regras LGPD de `PedidoSerializer` (`get_chave_pix()`, mascaramento para entregador, `get_local_retirada()`, `get_concluido_em()`, `get_avaliacoes_feitas()`), validações de `ItemCarrinhoSerializer`/`CheckoutSerializer`, regras da camada de serviço (`validar_pagamento()`, `finalizar_carrinho()` com snapshot/taxa negativa e `mudar_status()` com máquina de estados, papéis e estoque), `MockPixGateway` (BR Code e HMAC-SHA256) e `CentralNotificacoes` (e-mail, WhatsApp mock e isolamento de falhas entre provedores). |
| [`avaliacoes/test_unit.py`](avaliacoes/test_unit.py) | 5 | `AvaliacaoSerializer` (tipo produto/produtor, trava `read_only` na edição, regra `produto` XOR `produtor`, faixa 1–5, vínculo automático a pedido concluído elegível e rejeição de item/produtor alheio), titularidade em `ReclamacaoSerializer` e validações de produtor/status/duplicidade em `AvaliacaoClienteSerializer`. |
| [`painel/test_unit.py`](painel/test_unit.py) | 4 | Formatação de `LogAuditoria.__str__()`, `registrar_auditoria()` (extração de IP com proxy/direto e truncamento em 255 caracteres) e contrato de campos `read_only` em `ProdutoAdminSerializer` e `ProdutorAdminSerializer`. |

#### Testes de Integração (42 testes — `*/tests.py`)

**Como foram feitos:** escritos com **`APITestCase`** do Django REST Framework, executando requisições HTTP completas (JSON e `multipart`, com autenticação JWT) sobre rotas reais, views, permissões, middlewares e banco relacional em memória.

| Módulo | Qtd. | O que os testes se propõem a verificar |
|---|---|---|
| [`usuarios/tests.py`](usuarios/tests.py) | 10 | Fluxos de cadastro (cliente/produtor pendente e upload de foto da propriedade), leitura/edição de perfil, CRUD de endereços, exportação e exclusão/anonimização LGPD (com auditoria e revogação de tokens), proteção de logout contra terceiros, bloqueio de *path traversal* em `/assets/`, `/api/config/` e link de recuperação de senha. |
| [`catalogo/tests.py`](catalogo/tests.py) | 9 | Permissões de categorias, proteção contra exclusão de categoria com produtos, visibilidade pública vs. admin, vitrine de produtores (`aceita_pix` sem expor chave), busca e filtros do catálogo, isolamento anti-IDOR na edição de produtos, `/api/estatisticas/`, CSP + `/api/health/` e bloqueio de upload de imagem inválida. |
| [`pedidos/tests.py`](pedidos/tests.py) | 13 | Jornada completa compra → entrega → avaliação → KPIs, devolução de estoque no cancelamento, logout + redefinição de senha por e-mail, divisão automática do carrinho por produtor, cobrança Pix + webhook HMAC (incluindo rejeição de segredo padrão em produção), frete definido no servidor, recusa com motivo, regras de PATCH/unidades no carrinho, mascaramento e ciclo completo de entregas, isolamento do painel do produtor e bloqueio de categoria inativa. |
| [`avaliacoes/tests.py`](avaliacoes/tests.py) | 4 | Avaliação restrita a pedidos concluídos sem duplicidade, isolamento de reclamações entre clientes, avaliação recíproca do produtor ao cliente (imutável e sem duplicata) e histórico/edição/exclusão restritos ao autor com recálculo público de médias. |
| [`painel/tests.py`](painel/tests.py) | 6 | Bloqueio de acesso administrativo para não-admins, bloqueio/reativação de usuários com `LogAuditoria`, aprovação/suspensão de produtores, ocultação/reexibição de produtos imune a reversão pelo produtor, moderação auditada de reclamações e exclusão física vs. *soft delete* preservando integridade referencial de pedidos e avaliações. |

**CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):** pipeline no **GitHub Actions** (`push`, `pull_request` em `main`/`dev` e `workflow_dispatch`) com três jobs: **`backend-tests`** (Python 3.12: `check`, `makemigrations --check --dry-run`, `spectacular --validate`, `check --deploy` e os 104 testes com `coverage`), **`frontend-lint`** (Node.js 22: ESLint e Prettier em JS/CSS) e **`docker-build`** (`docker compose config --quiet` + build do `Dockerfile`).

```bash
python manage.py test config.test_unit usuarios.test_unit catalogo.test_unit pedidos.test_unit avaliacoes.test_unit painel.test_unit -v 2  # apenas unidade (62)
python manage.py test -v 2                                                                                                                   # suíte completa (104)
python manage.py check && python manage.py makemigrations --check --dry-run && python manage.py spectacular --validate --file /tmp/schema.yml
DJANGO_DEBUG=0 DJANGO_SECRET_KEY='<chave-50+-caracteres>' DJANGO_ALLOWED_HOSTS=localhost SECURE_SSL_REDIRECT=1 python manage.py check --deploy
```

### 4.5. Front-End e Demonstração

- **Interface sem CDNs/build (`script-src 'self'`):** HTML5, CSS3 (paleta `#246F11` / `#1B4312` / `#67AE25` / `#F7990C` / `#FAFAF8` / `#141712`, Light/Dark Mode, `prefers-reduced-motion`, botões ≥ `44px`, *focus trap*, `Escape`, `aria-live`, toggle de senha), 10 ES Modules (`main.js` + `frontend/js/*.js`) e sprite SVG local (`frontend/assets/icons.svg`).
- **Roteiro com dados do RN (`python manage.py seed_demo` em `DEBUG=1`):** popula 6 produtores aprovados + 1 pendente do RN, 30 produtos públicos, 5 clientes, 3 entregadores, 20 pedidos e 26 avaliações (credenciais demo exibidas apenas no terminal para `cliente_demo`, `produtor_demo`, `entregador_demo` e `admin`):
  1. **Visitante (`/`):** alternar tema, buscar/filtrar catálogo e explorar produtores do RN.
  2. **Cliente (`cliente_demo`):** cadastrar endereço (ViaCEP), montar carrinho, concluir checkout (Pix simulado) e checar timeline em *Meus Pedidos*.
  3. **Produtor (`produtor_demo`):** abrir workspace próprio, aceitar pedido (baixa estoque) e avançar até `Pronto`.
  4. **Entregador (`entregador_demo`):** painel direto (sem catálogo), endereço resumido → aceitar entrega → *Saiu para entrega* → *Confirmar entrega*.
  5. **Avaliações e Admin (`admin`):** avaliar pedido concluído como cliente e demonstrar KPIs, fila de pendências e moderação no workspace Admin.

<details>
  <summary><strong>Capturas de tela das principais interfaces (clique para expandir)</strong></summary>

  <br />

  <details>
    <summary>1. Vitrine Pública (Visitante)</summary>
    <p align="center"><img src="docs/screenshots/01-vitrine-publica.png" alt="Vitrine Pública da Feira Virtual" width="900" /></p>
  </details>

  <details>
    <summary>2. Home Autenticada do Cliente e Catálogo de Produtos</summary>
    <p align="center"><img src="docs/screenshots/02-cliente-catalogo.png" alt="Home do Cliente e Catálogo de Produtos" width="900" /></p>
  </details>

  <details>
    <summary>3. Workspace do Produtor Rural</summary>
    <p align="center"><img src="docs/screenshots/03-painel-produtor.png" alt="Painel do Produtor Rural" width="900" /></p>
  </details>

  <details>
    <summary>4. Workspace do Entregador Parceiro</summary>
    <p align="center"><img src="docs/screenshots/04-painel-entregador.png" alt="Painel de Entregas" width="900" /></p>
  </details>

  <details>
    <summary>5. Dashboard de Moderação Administrativa</summary>
    <p align="center"><img src="docs/screenshots/05-painel-admin.png" alt="Painel Administrativo" width="900" /></p>
  </details>
</details>

---

## 5. Arquitetura, Tecnologias e Diretórios

A **Feira Virtual** segue uma arquitetura **monolítica modular *single-server***: o backend em **Python 3.12**, **Django 6.1** e **Django REST Framework 3.18** (com **SimpleJWT**, `django-filter`, `django-cors-headers` e `drf-spectacular`) expõe a API REST em `/api/` e serve na mesma origem (`/`) a interface web em **HTML5**, **CSS3** e **JavaScript ES Modules**, utilizando **WhiteNoise** para estáticos, **Gunicorn** em **Docker Compose**, **Pillow** na validação de uploads e persistência configurável em **SQLite** ou **MySQL 8.4** (via **PyMySQL**), além de `coverage`, `pytest-django` e `ruff` em desenvolvimento.

```text
feira_virtual/
├── config/       # settings.py, urls.py, __init__.py (Adapter PyMySQL), middleware.py (CSP), validators.py
├── usuarios/     # Perfis (4 tipos), Endereco, permissions.py, LGPD, management/commands/seed_demo.py
├── catalogo/     # Categoria, Produto, vitrine pública e estatísticas
├── pedidos/      # Carrinho, Pedido, ItemPedido (snapshot), services.py, pix.py (Mock), notificacoes.py, entregas
├── avaliacoes/   # Avaliacao (produto/produtor), AvaliacaoCliente (recíproca) e Reclamacao
├── painel/       # Moderação admin, indicadores e LogAuditoria
├── frontend/     # index.html, style.css, main.js, js/ (9 ES Modules) e assets/ (logos, icons.svg, og-image.png)
├── docs/         # screenshots/ (capturas de tela das interfaces por perfil)
├── .github/      # workflows/ci.yml (GitHub Actions: checks, schema, testes + cobertura, ESLint/Prettier e build Docker)
└── Dockerfile · docker-compose.yml · entrypoint.sh · requirements.txt · requirements-dev.txt · .env.example
```

---

## 6. Execução Local (sem Docker) e Variáveis

**Pré-requisitos:** Python 3.12+, `pip`, `venv` (local) ou Docker Engine + Compose v2 (containers).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env && export DJANGO_DEBUG=1
python manage.py migrate && python manage.py seed_demo && python manage.py runserver
```

- **URLs locais:** Interface `http://127.0.0.1:8000/` · Swagger `/api/docs/` · Admin `/admin/` · Health `/api/health/`.
- **Acesso móvel / MySQL local:** use `ngrok http 8000` (ou `cloudflared tunnel`) para celular; ou ajuste `DB_ENGINE=mysql` e `DB_*` no `.env` para MySQL local.
- **Principais variáveis ([`.env.example`](.env.example)):** `DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `SECURE_SSL_REDIRECT`, `DB_ENGINE`/`DB_*`, `ENABLE_SWAGGER`, `SHOW_DEMO_SHORTCUTS`, `CORS_*`, `CSRF_TRUSTED_ORIGINS`, `EMAIL_*`, `THROTTLE_*`, `PIX_WEBHOOK_SECRET`, `TAXA_ENTREGA_PADRAO`. Em produção: `DJANGO_DEBUG=0`, chave ≥ 50 chars, `DB_ENGINE=mysql`, SMTP real, `SECURE_SSL_REDIRECT=1` atrás de TLS, `collectstatic --no-input` e `check --deploy`.

---

## 7. Considerações Finais

A **Feira Virtual** consolida modelagem relacional, arquitetura modular, padrões de projeto verificáveis no código, RBAC + LGPD, compatibilidade SQLite/MySQL 8.4, containerização e 104 testes automatizados (62 de unidade e 42 de integração) para a disciplina **Engenharia de Software (DCA3603)** em alinhamento aos ODS 2, 8 e 12.

**Trabalhos futuros (evoluções além do escopo da disciplina):** (1) migração de JWT para cookies `HttpOnly` com `ROTATE_REFRESH_TOKENS = True`; (2) integração com gateways reais de Pix e WhatsApp em produção; e (3) testes E2E automatizados de navegador (Playwright/Cypress).
