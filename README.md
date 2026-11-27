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
  Caio de Miranda Silva · Débora Nicolly Araújo da Silva<br />
  Douglas Amon Passos dos Anjos · Paulo Guilherme Xavier da Silva
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

> **Em resumo:** a **Feira Virtual** é uma aplicação web que conecta **produtores da agricultura familiar** diretamente a **consumidores**, com apoio de **entregadores parceiros** e **administradores**. Funciona como uma feira online completa: o produtor anuncia seus produtos, o cliente monta o carrinho e faz o pedido, o produtor prepara e baixa o estoque, o entregador realiza a entrega e, ao final, ambos podem se avaliar.

**Sumário:** [1. Princípios](#1-princípios-de-projeto-e-engenharia-de-software) · [2. Proposta, Motivação e ODS](#2-apresentação-motivação-e-ods) · [3. Padrões de Projeto](#3-padrões-de-projeto-aplicados) · [4. Critérios de Avaliação](#4-critérios-de-avaliação-e-evidências) ([4.1 Docker](#41-projeto-conteinerizado) · [4.2 API](#42-api-com-os-principais-requisitos) · [4.3 Auth](#43-autenticação-e-autorização) · [4.4 Testes/CI](#44-ci-e-testes) · [4.5 Front-End](#45-front-end-e-demonstração)) · [5. Arquitetura, Tecnologias e Diretórios](#5-arquitetura-tecnologias-e-diretórios) · [6. Execução Local e Variáveis](#6-execução-local-sem-docker-e-variáveis) · [7. Considerações Finais](#7-considerações-finais)

---

## 1. Princípios de Projeto e Engenharia de Software

Princípios de engenharia são boas práticas usadas para construir um software organizado, seguro e fácil de evoluir sem quebrar o que já funciona:

| Princípio | O que significa na prática | Como aparece na Feira Virtual |
|---|---|---|
| **Modularidade** | Dividir o sistema em partes menores com funções claras, em vez de um bloco único confuso. | 5 módulos Django independentes (`usuarios`, `catalogo`, `pedidos`, `avaliacoes`, `painel`), mais `config` e 10 arquivos organizados no front-end (`frontend/`). |
| **Separação de responsabilidades** | Cada camada faz apenas o seu papel: receber pedidos da tela, validar dados ou aplicar regras de negócio. | Rotas/telas (`*/views.py`), validação de entrada (`*/serializers.py`) e regras críticas de compra/estoque isoladas em [`pedidos/services.py`](pedidos/services.py). |
| **Baixo acoplamento** | As partes não ficam "presas" umas às outras, permitindo trocar serviços externos sem reescrever o núcleo. | Pagamento Pix (`pedidos/pix.py`) e notificações (`pedidos/notificacoes.py`) usam contratos genéricos; o site conversa com o servidor apenas via `/api/` (`api.js`). |
| **Alta coesão** | Tudo que pertence ao mesmo assunto fica guardado junto no mesmo lugar. | Cada módulo reúne seus próprios dados (`models.py`), validações (`serializers.py`), regras (`views.py`), rotas (`urls.py`) e testes (`test_unit.py` e `tests.py`). |
| **Reutilização de código** | Criar soluções comuns para evitar copiar e colar a mesma lógica em vários arquivos. | Regra única de checagem de perfil (`_PorTipo` em `usuarios/permissions.py`), função única de mudança de status (`mudar_status()`) e funções compartilhadas no JS (`apiFetch()`, `renderIcon()`). |
| **Manutenibilidade** | Facilitar encontrar erros, corrigir bugs e adicionar novidades com segurança no futuro. | 104 testes automatizados (62 de unidade + 42 de integração), registros de auditoria (`LogAuditoria` em `painel/models.py`), logs claros e histórico organizado no Git. |
| **Segurança** | Garantir que cada pessoa só veja e faça o que tem permissão, protegendo dados sensíveis. | Acesso por perfil (RBAC), bloqueio de acesso a dados de terceiros (anti-IDOR), proteção contra scripts invasores (CSP), bloqueio de acesso indevido a pastas do servidor (*path traversal*), limite de tentativas de login, validação real de imagens (Pillow) e direitos LGPD. |
| **Escalabilidade** | Preparar o sistema para crescer em número de usuários e produtos sem perder desempenho. | Listagens divididas em páginas de 20 itens, índices no banco, consultas otimizadas, servidor de produção (Gunicorn + WhiteNoise) e banco MySQL 8.4 *(para múltiplos servidores simultâneos, os uploads em `/media/` migrariam para armazenamento em nuvem como S3/R2)*. |

---

## 2. Apresentação, Motivação e ODS

A **Feira Virtual** aproxima **produtores rurais da agricultura familiar** e **consumidores urbanos** em uma plataforma única de venda direta, integrando vitrine de produtos, carrinho inteligente (que separa automaticamente os itens por produtor), controle seguro de estoque, gestão de entregas, avaliações após a compra e moderação administrativa.

- **Por que o sistema foi criado (Motivação):** pequenos produtores costumam enfrentar pouca visibilidade comercial, dependência de atravessadores que reduzem sua margem de lucro e desorganização no controle manual de pedidos, estoques e entregas.
- **O que ele resolve (Objetivos):** oferece venda direta com informações transparentes (preço, estoque, tipo de cultivo — orgânico, agroecológico ou convencional — e formas de pagamento), organiza o ciclo completo do pedido em etapas claras e entrega uma área dedicada para cada perfil de usuário.
- **Como funciona na prática:** (1) o produtor cadastra sua propriedade e produtos (liberados após aprovação do admin); (2) o cliente escolhe itens, endereço e pagamento (Pix, cartão na maquininha ou dinheiro); (3) o produtor aceita o pedido — o que desconta o estoque automaticamente — e prepara; (4) o entregador aceita e conclui a entrega (ou o cliente retira no local), liberando avaliações mútuas.
- **Alinhamento aos ODS ([Agenda 2030 — ONU Brasil](https://brasil.un.org/pt-br/sdgs)):** o software foi pensado considerando os Objetivos de Desenvolvimento Sustentável — em especial o **[ODS 2](https://brasil.un.org/pt-br/sdgs/2)** (*Fome Zero e Agricultura Sustentável*), o **[ODS 8](https://brasil.un.org/pt-br/sdgs/8)** (*Trabalho Decente e Crescimento Econômico*) e o **[ODS 12](https://brasil.un.org/pt-br/sdgs/12)** (*Consumo e Produção Responsáveis*), ao buscar ampliar o acesso de agricultores familiares ao mercado, valorizar o trabalho local e organizar pedidos e estoques. *(Contribuições esperadas em escopo acadêmico, sem medição empírica em campo.)*

---

## 3. Padrões de Projeto Aplicados

**Padrões de projeto** são modelos consagrados de organização de código usados na engenharia de software para resolver problemas recorrentes com clareza e flexibilidade. Abaixo estão os padrões aplicados diretamente no código (distinguindo **Padrões GoF** clássicos, **Padrão Arquitetural** e boas práticas complementares como cópia histórica dos itens comprados, desativação lógica sem apagar dados e proteção de cabeçalhos de segurança):

| Padrão | Categoria | Para que serve (em linguagem simples) | Onde está no código | Benefício prático |
|---|---|---|---|---|
| **Service Layer** | Arquitetural | Concentrar as regras críticas do negócio (fechar pedido, mudar status, mexer no estoque) em um único lugar, fora das rotas da web. | [`pedidos/services.py`](pedidos/services.py): `finalizar_carrinho()`, `mudar_status()`, `validar_pagamento()`, `_baixar_estoque()`, `_devolver_estoque()`, `TRANSICOES`. | Evita erros como vender o último item duas vezes ao mesmo tempo (`@transaction.atomic` + trava no banco) e reaproveita as regras para todos os perfis. |
| **Strategy** (+ Factory) | GoF Comportamental | Definir um "molde" para serviços que podem mudar (provedor de Pix ou canal de aviso) sem precisar alterar o fluxo de pedidos. | [`pedidos/pix.py`](pedidos/pix.py) (`GatewayPixBase`, `MockPixGateway`, `obter_gateway_pix()`) e [`pedidos/notificacoes.py`](pedidos/notificacoes.py) (`NotificadorBase`, `NotificadorEmail`, `NotificadorWhatsApp`, `CentralNotificacoes`). | Facilita plugar gateways reais (Mercado Pago, Asaas, Efí, WhatsApp) no futuro e impede que a falha em um aviso (ex.: e-mail) quebre o pedido. |
| **Adapter** | GoF Estrutural | Funcionar como um "adaptador de tomada" que faz duas ferramentas diferentes se entenderem. | [`config/__init__.py`](config/__init__.py) (`pymysql.install_as_MySQLdb()`) e [`entrypoint.sh`](entrypoint.sh). | Permite usar a biblioteca leve `PyMySQL` no lugar do conector tradicional `mysqlclient`, simplificando o Docker e a troca entre SQLite e MySQL. |
| **Template Method** | GoF Comportamental | Criar uma regra-base pronta e reaproveitá-la mudando apenas um detalhe em cada variação. | [`usuarios/permissions.py`](usuarios/permissions.py): classe-base `_PorTipo` herdada por `EhCliente`, `EhProdutor`, `EhEntregador` e `EhAdmin`. | Evita repetir código de verificação de login e perfil nas rotas, garantindo regras uniformes de permissão. |
| **Facade** | GoF Estrutural | Esconder tarefas complexas de comunicação com o servidor atrás de uma única função simples de chamar. | [`frontend/js/api.js`](frontend/js/api.js): `apiFetch()`, `refreshAccessToken()`, `processQueue()`, `tokens`, `parseError()`. | As 8 telas do site só chamam `apiFetch()` sem se preocupar com envio de token, renovação automática da sessão expirada ou tradução de erros. |

> **Observação sobre simulações:** o pagamento Pix (`MockPixGateway`, marcado com `"simulado": True`) e o envio de WhatsApp (`NotificadorWhatsApp`, via log `[WHATSAPP MOCK]`) são simulados para fins acadêmicos; o envio de e-mail (`NotificadorEmail`) exibe a mensagem no terminal em desenvolvimento e suporta servidor SMTP real via configuração.

---

## 4. Critérios de Avaliação e Evidências

### 4.1. Projeto Conteinerizado

**Conteinerizar** (com Docker) significa empacotar o sistema e todas as suas dependências em "caixas" padronizadas (contêineres) para que o projeto rode da mesma forma em qualquer computador, sem depender de instalações manuais complexas.

- **[`Dockerfile`](Dockerfile):** monta a imagem da aplicação em Python 3.12 rodando com um usuário sem privilégios de administrador (`appuser`), serve arquivos estáticos de forma otimizada (WhiteNoise), monitora automaticamente se o servidor está saudável (`/api/health/`) e inicia o servidor de produção **Gunicorn** (3 processos paralelos).
- **[`docker-compose.yml`](docker-compose.yml) e [`entrypoint.sh`](entrypoint.sh):** sobem e conectam dois contêineres juntos — `db` (banco de dados **MySQL 8.4** com dados salvos em volume persistente `mysql_data`) e `web` (aplicação Django na porta `8000` com volume `media_data` para fotos). Na inicialização, o script aguarda o banco ficar pronto e cria/atualiza as tabelas automaticamente (`migrate`).

```bash
cp .env.example .env            # cria o arquivo de configurações (defina chave secreta e senhas)
docker compose up --build -d    # constrói e inicia o banco MySQL 8.4 + o site em segundo plano
docker compose ps               # confere se os dois contêineres estão saudáveis ("healthy")
docker compose logs -f web      # acompanha os registros do servidor | "docker compose down" desliga mantendo os dados
```

### 4.2. API com os Principais Requisitos

Uma **API REST** é a ponte de comunicação entre o que o usuário vê na tela e o servidor: cada ação (como buscar produtos, adicionar ao carrinho ou aprovar um produtor) envia um pedido padronizado em JSON (ou arquivo de imagem validado com Pillow) para um endereço `/api/...`. As listagens retornam 20 itens por página, com suporte a busca, filtros e ordenação. A documentação interativa (**Swagger UI**) fica em `http://127.0.0.1:8000/api/docs/` *(restrita a administradores; `ENABLE_SWAGGER=1` libera no ambiente local)*.

| Módulo | O que oferece e principais rotas REST |
|---|---|
| **Usuários & LGPD** (`usuarios/urls.py`) | Cadastros, login/logout, recuperação de senha, perfil, endereços e direitos LGPD (baixar dados e excluir/anonimizar conta): `/api/auth/registro/{cliente,produtor,entregador}/` · `/api/auth/{login,refresh,logout,recuperar-senha,redefinir-senha}/` · `/api/perfil/` (`/produtor/`, `/entregador/`, `/exportar-dados/`, `/excluir-conta/`) · `/api/enderecos/` |
| **Catálogo** (`catalogo/urls.py`) | Vitrine pública de produtos e produtores, busca/filtros, categorias, números da feira e cadastro de itens pelo produtor: `/api/categorias/` · `/api/produtos/` (`?search=`, `?categoria=`, `?tipo_producao=`, `?produtor=`, `?ordering=`, `?page=`) · `/api/produtores/` · `/api/estatisticas/` · `/api/produtor/produtos/` |
| **Pedidos & Pix** (`pedidos/urls.py`) | Carrinho, finalização de compra (dividindo automaticamente por produtor), cancelamento, cobrança Pix simulada e gestão de vendas: `/api/carrinho/` (`/itens/`) · `/api/pedidos/` (`/{id}/cancelar/`, `/{id}/pix/`, `/pix/webhook/`) · `/api/produtor/pedidos/` (`/{id}/aceitar/`, `/recusar/`, `/status/`, `/vendas/`, `/resumo/`) |
| **Entregas** (`pedidos/urls.py`) | Fila de entregas disponíveis, entregas em andamento, histórico, resumo de ganhos e avanço de status pelo entregador: `/api/entregas/?escopo=disponiveis\|minhas\|historico` · `/api/entregas/resumo/` · `/api/entregas/{id}/{aceitar,saiu-para-entrega,confirmar}/` |
| **Avaliações** (`avaliacoes/urls.py`) | Notas e comentários pós-compra (sobre produto e produtor), avaliação recíproca do cliente pelo produtor e abertura de reclamações: `/api/avaliacoes/` (`/minhas/`) · `/api/produtor/avaliacoes/` · `/api/produtor/avaliacoes-clientes/` · `/api/reclamacoes/` |
| **Admin & Sistema** (`painel/urls.py`, `config/urls.py`) | Painel gerencial com indicadores, moderação de contas/produtos/reclamações, checagem de saúde e documentação técnica: `/api/admin/indicadores/` · `/api/admin/{usuarios,produtores,produtos,pedidos,reclamacoes,avaliacoes,avaliacoes-clientes}/` · `/api/config/` · `/api/health/` · `/api/schema/` · `/api/docs/` |

### 4.3. Autenticação e Autorização

- **Autenticação — "provar quem você é" (`SimpleJWT`):** ao fazer login, o usuário recebe duas credenciais digitais (tokens JWT): um de acesso (`1h`) e um de renovação (`7d`). Ao sair, o token é invalidado numa lista de bloqueio (`token_blacklist`) e o servidor impede que terceiros encerrem a sessão de outra pessoa (`403`). Há limite de tentativas por minuto contra invasões por força bruta (`login`: `10/min`; `registro`/`recuperar_senha`: `5/min`) e a recuperação de senha retorna sempre a mesma resposta neutra para não revelar quais e-mails existem. *(No front-end, o token fica no `localStorage` protegido por política rígida de scripts `script-src 'self'`; a migração para cookies `HttpOnly` com rotação automática está mapeada como evolução futura.)*
- **Autorização — "definir o que você pode fazer" (RBAC + Anti-IDOR):** por padrão, todas as rotas privadas começam bloqueadas (*default-deny*). As permissões em [`usuarios/permissions.py`](usuarios/permissions.py) verificam o perfil do usuário e cada consulta filtra apenas os registros do próprio titular (anti-IDOR — evita acessar dados alheios trocando o ID na URL):

| Perfil | O que pode e o que não pode fazer |
|---|---|
| **Cliente** (`EhCliente`) | Compra produtos, gerencia carrinho e endereços, acompanha/cancela seus pedidos (enquanto não entrarem em preparo), avalia após a entrega e abre reclamações. |
| **Produtor Rural** (`EhProdutor`) | Gerencia dados da propriedade, produtos, pedidos recebidos, vendas e avaliação de clientes; não pode reverter produtos ocultados pela moderação administrativa. |
| **Entregador** (`EhEntregador`) | Antes de aceitar, vê apenas o bairro/cidade (privacidade do cliente); após aceitar, vê o endereço completo e segue a ordem obrigatória `Pronto → Em entrega → Concluído`. |
| **Administrador** (`EhAdmin`) | Gerencia usuários, aprova ou suspende produtores, modera produtos, reclamações e avaliações, e tem todas as ações críticas gravadas no log de auditoria (`LogAuditoria`). |

### 4.4. CI e Testes

Para garantir que as regras funcionam e não quebram em futuras alterações, o projeto conta com **104 testes automatizados aprovados** (**92%** do código coberto, medido via `coverage`). Eles estão divididos em duas camadas complementares: primeiro os **Testes de Unidade** (que testam cada função ou regra isoladamente, como checar cada peça de um carro na bancada) e depois os **Testes de Integração** (que simulam o uso real completo pela API, como testar o carro andando na rua).

#### 1. Testes de Unidade (62 testes — `*/test_unit.py`)

**Como foram feitos:** usam `SimpleTestCase` (rodando sem banco de dados para funções puras e regras isoladas) e `TestCase`, combinados com o **`APIRequestFactory`** do Django REST Framework, chamadas diretas a **serializers**, **permissões**, **validadores**, **middleware** e **funções de serviço**, além de simulações controladas (`unittest.mock` e `override_settings`) para testar e-mails, logs, falhas de banco e variáveis de ambiente sem depender de serviços externos. Executam em ~2,5 segundos.

| Módulo | Qtd. | O que os testes se propõem a verificar |
|---|---|---|
| [`config/test_unit.py`](config/test_unit.py) | 12 | Validação de imagens (`validar_imagem_upload`: bloqueio acima de 5 MB, formatos proibidos e arquivos falsos com Pillow), cabeçalhos de segurança CSP (`ContentSecurityPolicyMiddleware` em rotas comuns, Swagger e headers pré-existentes) e views utilitárias (`health_view` respondendo 200 ou 503 em falha do banco, proteção contra frete negativo em `config_publica_view` e bloqueio de *path traversal* em assets/mídia). |
| [`usuarios/test_unit.py`](usuarios/test_unit.py) | 11 | Matriz completa de permissões RBAC (`EhCliente`, `EhProdutor`, `EhEntregador`, `EhAdmin`, `AdminEscreveTodosLeem` para leitura pública vs. escrita admin e visitantes), extração do IP real (`_obter_ip`), formatação de endereços (`como_texto`), regra de superusuário virando `ADMIN` em `Usuario.save()` e validações dos serializers (campos somente leitura, força da senha e criação atômica de usuário + perfil). |
| [`catalogo/test_unit.py`](catalogo/test_unit.py) | 6 | Regras da vitrine pública (`get_cidade_uf`, `get_aceita_pix` e garantia de que `chave_pix` nunca é exposta), validações do produtor (bloqueio de categoria inativa, imagem inválida e impossibilidade de desfazer `oculto_moderacao`) e validações do modelo `Produto` (preço mínimo e estoque não negativo). |
| [`pedidos/test_unit.py`](pedidos/test_unit.py) | 24 | Geração do código público do pedido (`PED-...`), cálculos de total/frete/subtotais decimais, resumo de endereço para entregadores, regras LGPD do `PedidoSerializer` (quem pode ver a chave Pix, mascaramento de endereço, local de retirada e avaliações feitas), validações do carrinho e checkout (produtos indisponíveis, unidades inteiras vs. peso, titularidade do endereço), regras da camada de serviço (`validar_pagamento`, `finalizar_carrinho` com cópia histórica de preço e frete seguro, e `mudar_status` com fluxo permitido, papéis e baixa/devolução de estoque), gateway Pix simulado (BR Code e assinatura HMAC-SHA256) e central de notificações (e-mail, WhatsApp mock e isolamento quando um canal falha). |
| [`avaliacoes/test_unit.py`](avaliacoes/test_unit.py) | 5 | Validações de `AvaliacaoSerializer` (avaliar produto **ou** produtor, nunca ambos; nota entre 1 e 5; bloqueio de alterar vínculos ao editar; vínculo automático a pedido concluído; rejeição de item/produtor que não pertence ao pedido), verificação de titularidade em `ReclamacaoSerializer` e regras da avaliação recíproca em `AvaliacaoClienteSerializer`. |
| [`painel/test_unit.py`](painel/test_unit.py) | 4 | Formatação textual do `LogAuditoria`, função `registrar_auditoria()` (extração de IP via proxy ou acesso direto e limite seguro de 255 caracteres na descrição) e proteção de campos somente leitura nos serializers administrativos. |

#### 2. Testes de Integração (42 testes — `*/tests.py`)

**Como foram feitos:** usam **`APITestCase`** do Django REST Framework para disparar requisições HTTP completas (com JSON, upload de imagens e login real por token JWT) passando por toda a cadeia do sistema: URLs, middlewares, permissões, views, regras de negócio e banco de dados em memória.

| Módulo | Qtd. | O que os testes se propõem a verificar |
|---|---|---|
| [`usuarios/tests.py`](usuarios/tests.py) | 10 | Cadastros completos (cliente e produtor pendente com foto), edição de perfil, CRUD de endereços, exportação e anonimização de conta LGPD (com auditoria e revogação de login), bloqueio de logout por terceiros, bloqueio de acesso indevido a pastas em `/assets/`, configurações públicas e link de recuperação de senha. |
| [`catalogo/tests.py`](catalogo/tests.py) | 9 | Permissão exclusiva de admin para categorias, bloqueio ao tentar apagar categoria em uso, categorias públicas vs. admin, vitrine sem expor chave Pix, busca e filtros de produtos, bloqueio de edição de produto de outro produtor (anti-IDOR), estatísticas públicas, CSP + `/api/health/` e rejeição de uploads inválidos. |
| [`pedidos/tests.py`](pedidos/tests.py) | 13 | Jornada completa ponta a ponta (cadastro → compra → entrega → avaliação → indicadores), devolução de estoque em cancelamentos, logout + redefinição de senha, separação automática do carrinho em pedidos por produtor, cobrança Pix + confirmação por webhook assinado (e bloqueio de segredo padrão em produção), frete controlado pelo servidor, recusa com motivo, regras do carrinho, ciclo completo das entregas com privacidade de endereço, painel do produtor e bloqueio de categoria desativada. |
| [`avaliacoes/tests.py`](avaliacoes/tests.py) | 4 | Permissão de avaliar apenas após compra concluída (sem duplicar), isolamento de reclamações entre clientes, avaliação recíproca do cliente pelo produtor (imutável) e controle de edição/exclusão restrito ao autor com atualização pública das notas médias. |
| [`painel/tests.py`](painel/tests.py) | 6 | Bloqueio do painel para não-administradores, bloqueio/reativação de contas com auditoria, aprovação/suspensão de produtores, moderação de produtos imune a alteração pelo produtor, resposta auditada a reclamações e exclusão física vs. desativação lógica (*soft delete*) preservando pedidos e avaliações antigos. |

**Integração Contínua — CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):** sempre que alguém envia código (`push`) ou abre um *pull request* no GitHub (`main` e `dev`), um fluxo automatizado no **GitHub Actions** executa três verificações independentes: (1) **`backend-tests`** (Python 3.12: checagens do Django, migrações, validação do schema OpenAPI, checklist de produção e os 104 testes com cobertura); (2) **`frontend-lint`** (Node.js 22: revisão automática de estilo e qualidade do JavaScript e CSS com ESLint e Prettier); e (3) **`docker-build`** (valida o `docker-compose.yml` e constrói a imagem Docker).

```bash
python manage.py test config.test_unit usuarios.test_unit catalogo.test_unit pedidos.test_unit avaliacoes.test_unit painel.test_unit -v 2  # roda só os 62 testes de unidade (~2,5s)
python manage.py test -v 2                                                                                                                   # roda todos os 104 testes (unidade + integração)
python manage.py check && python manage.py makemigrations --check --dry-run && python manage.py spectacular --validate --file /tmp/schema.yml
DJANGO_DEBUG=0 DJANGO_SECRET_KEY='<chave-50+-caracteres>' DJANGO_ALLOWED_HOSTS=localhost SECURE_SSL_REDIRECT=1 python manage.py check --deploy
```

### 4.5. Front-End e Demonstração

- **Interface web limpa e acessível:** construída com HTML5, CSS3 e JavaScript puro modular (10 módulos ES sem dependência de CDNs externas ou etapa de compilação), com modo claro e escuro, botões confortáveis para toque (≥ `44px`), ícones locais em SVG, foco preso em janelas modais, fechamento com `Escape`, alertas acessíveis (`aria-live`) e opção de mostrar/ocultar senha.
- **Roteiro prático para apresentação (com dados fictícios do RN):** rodando `python manage.py seed_demo` (com `DEBUG=1`), o sistema popula 6 produtores aprovados + 1 pendente do Rio Grande do Norte, 30 produtos, 5 clientes, 3 entregadores, 20 pedidos e 26 avaliações (as senhas de demonstração aparecem apenas no terminal):
  1. **Visitante (`/`):** alternar tema claro/escuro, buscar/filtrar produtos e navegar pelos produtores do RN.
  2. **Cliente (`cliente_demo`):** cadastrar endereço (com preenchimento automático via ViaCEP), montar carrinho, finalizar compra (Pix simulado) e acompanhar o status em *Meus Pedidos*.
  3. **Produtor (`produtor_demo`):** abrir o painel do produtor, aceitar o pedido (vendo o estoque diminuir) e avançar até `Pronto`.
  4. **Entregador (`entregador_demo`):** abrir o painel de entregas, conferir o endereço resumido → aceitar entrega (liberando o endereço completo) → *Saiu para entrega* → *Confirmar entrega*.
  5. **Avaliações e Admin (`admin`):** avaliar o pedido concluído como cliente e mostrar indicadores gerais, aprovação de produtores e moderação no painel administrativo.

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

A **Feira Virtual** utiliza uma arquitetura **monolítica modular em servidor único**: em vez de dividir o sistema em vários servidores separados, um único servidor organizado em módulos bem definidos entrega tanto a API (`/api/`) quanto as páginas da interface web (`/`). O servidor é feito em **Python 3.12**, **Django 6.1** e **Django REST Framework 3.18** (com **SimpleJWT** para login, `django-filter` para buscas/filtros, `django-cors-headers` para controle de origem e `drf-spectacular` para a documentação Swagger); a interface usa **HTML5**, **CSS3** e **JavaScript ES Modules**; as imagens enviadas são validadas com **Pillow**; os arquivos estáticos são servidos pelo **WhiteNoise**; em produção/Docker o aplicativo roda sob **Gunicorn**; e o banco de dados alterna facilmente entre **SQLite** (local/testes) e **MySQL 8.4** (via **PyMySQL**), com `coverage`, `pytest-django` e `ruff` apoiando o desenvolvimento.

```text
feira_virtual/
├── config/       # Configurações globais, rotas principais, segurança (CSP), validador de imagens e adaptador MySQL
├── usuarios/     # Contas (4 perfis), endereços, regras de permissão, LGPD e comando de dados demo (seed_demo.py)
├── catalogo/     # Categorias, produtos, vitrine pública de produtores e estatísticas da feira
├── pedidos/      # Carrinho, pedidos, cópia histórica dos itens, regras de negócio (services.py), Pix simulado, avisos e entregas
├── avaliacoes/   # Avaliações pós-compra (produto/produtor), avaliação recíproca de clientes e reclamações
├── painel/       # Painel administrativo, indicadores gerenciais, moderação e registro de auditoria (LogAuditoria)
├── frontend/     # Páginas e estilos (index.html, style.css), scripts modulares (main.js + js/) e imagens/ícones (assets/)
├── docs/         # Capturas de tela das interfaces por perfil (screenshots/)
├── .github/      # Automação de testes, qualidade de código e build Docker no GitHub Actions (workflows/ci.yml)
└── Dockerfile · docker-compose.yml · entrypoint.sh · requirements.txt · requirements-dev.txt · .env.example
```

---

## 6. Execução Local (sem Docker) e Variáveis

**Pré-requisitos:** Python 3.12+ (para rodar direto na máquina) ou Docker com Compose v2 (para rodar em contêineres, conforme a Seção 4.1).

```bash
python3 -m venv .venv && source .venv/bin/activate     # cria e ativa o ambiente virtual Python
pip install -r requirements.txt -r requirements-dev.txt # instala as bibliotecas do projeto
cp .env.example .env && export DJANGO_DEBUG=1           # cria o arquivo de configurações para modo local
python manage.py migrate && python manage.py seed_demo && python manage.py runserver  # cria tabelas, popula dados demo e liga o site
```

- **Endereços locais:** Site principal `http://127.0.0.1:8000/` · Documentação Swagger `/api/docs/` · Admin Django `/admin/` · Checagem de saúde `/api/health/`.
- **Testar no celular ou usar MySQL local:** use `ngrok http 8000` (ou `cloudflared tunnel`) para gerar um link temporário no celular; para conectar a um MySQL local, ajuste `DB_ENGINE=mysql` e os dados `DB_*` no arquivo `.env`.
- **Variáveis de ambiente ([`.env.example`](.env.example)):** são ajustes guardados fora do código para proteger senhas e alternar entre desenvolvimento e produção (`DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `SECURE_SSL_REDIRECT`, `DB_ENGINE`/`DB_*`, `ENABLE_SWAGGER`, `SHOW_DEMO_SHORTCUTS`, `CORS_*`, `CSRF_TRUSTED_ORIGINS`, `EMAIL_*`, `THROTTLE_*`, `PIX_WEBHOOK_SECRET`, `TAXA_ENTREGA_PADRAO`). Em produção, recomenda-se `DJANGO_DEBUG=0`, chave secreta com 50+ caracteres, MySQL, SMTP real, HTTPS ativo (`SECURE_SSL_REDIRECT=1`), `collectstatic` e validação com `check --deploy`.

---

## 7. Considerações Finais

A **Feira Virtual** reúne modelagem de banco de dados, arquitetura modular, padrões de projeto verificáveis no código, segurança por perfil com conformidade LGPD, suporte a SQLite e MySQL 8.4, execução em Docker e **104 testes automatizados** (62 de unidade e 42 de integração) para a disciplina **Engenharia de Software (DCA3603)**, em alinhamento aos ODS 2, 8 e 12.

**Evoluções futuras (além do escopo da disciplina):** (1) migrar os tokens JWT do `localStorage` para cookies `HttpOnly` com renovação rotativa (`ROTATE_REFRESH_TOKENS = True`); (2) conectar provedores reais de pagamento Pix e mensagens via WhatsApp; e (3) adicionar testes automatizados de ponta a ponta simulando cliques reais no navegador (Playwright/Cypress).
