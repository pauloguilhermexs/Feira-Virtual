# Testes da Feira Virtual

## Instalação e execução

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium
make test-unit
make test-integration
make test-system
make test-all
make test-coverage
make test-report
```

`test-coverage` executa a suíte completa; todos os comandos de execução já medem cobertura de linhas e branches. `test-report` apenas regenera HTML, JSON e PNG dos XML/JSON existentes. Cada execução substitui o relatório principal; conserve cópias se precisar comparar seleções. O relatório indica qual seleção foi executada. Durações por categoria somam setup, chamada e teardown; duração total também inclui coleta e overhead do runner.

Neste ambiente, o navegador Chromium baixado não iniciou normalmente. Foi usado Chrome headless compatível com Playwright:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome
make test-all
```

A configuração `config.settings_test` força SQLite em memória, e-mail local e armazenamento de uploads em memória, sem ler credenciais de produção. Não altere esse arquivo para apontar para banco real. Não é necessário executar migrate ou seed_demo manualmente. As fixtures criam os dados fictícios no banco de testes; cada cenário é isolado. Senhas `Teste-E2E-12345` pertencem apenas às contas fictícias criadas pelos testes.

## Organização e descoberta

- `usuarios/tests.py`, `catalogo/tests.py`, `pedidos/tests.py`, `avaliacoes/tests.py`, `painel/tests.py`: 42 testes originais de integração API, preservados integralmente. `reports/testes/originais-sha256.json` registra os hashes do ZIP.
- `tests/unit/`: regras isoladas, parametrização de limites, permissões, modelos não persistidos e serializers. SimpleTestCase protege as verificações de endereço; pytest-django bloqueia acesso ao banco nos demais testes sem marcação.
- `tests/integration/`: testes de API com estado persistido, rollback, snapshots e webhook idempotente. O mock de notificação injeta uma falha controlada para verificar rollback; não usa rede.
- `tests/system/`: Playwright com servidor Django e banco de teste. Cadastro/login, busca/filtro, carrinho/checkout, produtor, entregador, avaliação e moderação são realizados na interface. ORM somente prepara fixtures e verifica efeitos; não substitui cliques por chamadas diretas de API.
- `conftest.py` atribui uma única categoria a cada item e captura docstrings, código e identificação no XML. `--import-mode=importlib` evita colisões entre nomes iguais em pastas distintas. Nenhuma pasta `app/tests/` conflita com os arquivos legados.

```bash
python -m pytest --collect-only -q
python -m pytest -m unit
python -m pytest -m integration
python -m pytest -m system
python -m pytest tests/integration/test_checkout_estoque.py::test_aceite_atomico -vv
```

O runner oficial passa por pytest. `manage.py test` continua podendo executar os cinco módulos antigos; não descobre automaticamente as funções pytest adicionadas.

## Painel e evidências

Abra `reports/testes/index.html` diretamente no navegador. Todo o JSON está embutido; não é necessário servidor nem CDN. Os links para `resultados.json` e `coverage/index.html` são relativos. O painel contém pesquisa, filtros, árvore Tipo → Módulo → Classe → Teste, código das asserções, docstrings, resultado observado, duração e traceback. Testes antigos sem docstring são identificados dessa forma; não se inventam objetivos detalhados.

- Verde: todos os itens da seleção executada passaram e o processo retornou sucesso.
- Vermelho: ao menos uma falha/erro, incluindo erro de coleta ou exit code não zero.
- Cinza: resultado ausente, nenhuma execução ou testes ignorados sem falhas. Ignorados não são aprovados.
- `visao-geral.png`: captura real 1440×900.
- `falhas.png`: gerado apenas quando a execução principal falha; filtro de problemas e árvore expandida.
- `e2e/*.png` e `e2e/*.zip`: screenshots e traces de cenários de sistema que falharam. `python -m playwright show-trace caminho.zip` permite inspecionar cliques e respostas.
- `baseline/`: XML, log e cobertura da execução original, anterior aos novos testes.
- `historico-desenvolvimento/`: resultados intermediários de construção da suíte, separados do relatório final. Não representam o estado final da aplicação.

Use “Imprimir / PDF” para exportar pelo navegador. Abra os detalhes desejados antes de imprimir. Uma barra verde valida as asserções presentes, não certifica o sistema inteiro.

## Matriz de requisitos

Os nomes abaixo são rastreáveis nos resultados JSON e no código. Consulte o resultado efetivo de cada teste no painel, evitando tratar esta matriz como evidência autônoma de aprovação.

| Requisito | Unidade/integração | Cenários | Testes existentes | Novos testes | Resultado |
|---|---|---|---|---|---|
| Endereço e privacidade | Unidade + API | Complemento/CEP ausentes, resumo sem rua, isolamento | usuarios: endereco_crud; pedidos: entregador_ve_endereco_resumido | EnderecoTests; test_endereco_resumido | JSON por teste |
| Perfis e acesso | Unidade + API | Autenticado, anônimo e perfil incorreto | painel: permissoes_admin; pedidos: permissões | test_perfil; test_admin; test_leitura_publica; test_auditoria_trunca_descricao | JSON por teste |
| Cadastro/aprovação/suspensão | API + sistema | Pendente invisível, aprovado visível, suspenso oculto | usuarios: registro_produtor; pedidos: fluxo; painel: aprovar_e_suspender | test_cadastro_cliente; test_admin_moderacao | JSON por teste |
| Produto | Unidade + API | Preço 0/negativo/0,01; estoque 0/negativo; unidade desconhecida; categoria inativa | catalogo: filtros_e_busca; pedidos: categoria_inativa | test_campos; test_categoria; test_vitrine_busca_filtro | JSON por teste |
| Upload | Unidade + API | PNG válido, extensão inválida, conteúdo falso, acima de 5 MB | catalogo: upload_imagem_invalida | test_upload | JSON por teste |
| Carrinho/checkout | Unidade + API + sistema | Quantidade fracionada, acima do estoque, edição, frete do servidor | pedidos: fluxo; patch_item_carrinho; checkout_ignora_taxa | test_subtotal; test_total_frete; test_compra_entrega_avaliacao | JSON por teste |
| Múltiplos produtores | API | Separação dos pedidos por produtor | pedidos: multiplos_produtores_geram_pedidos_separados | test_multiplos_produtores_totais_e_rollback | JSON por teste |
| Estoque transacional | API + ORM | Aceite, devolução única, segundo item insuficiente, falha de dependência | pedidos: cancelamento_devolve_estoque | test_aceite_atomico; test_cancelamento_repetido; test_checkout_rollback_notificacao | JSON por teste |
| Snapshot financeiro | Unidade + API | Decimal, arredondamento, alteração posterior de nome/preço | pedidos: fluxo | test_snapshot_preco; test_subtotal | JSON por teste |
| Pix simulado | Unidade + API | Forma aceita/recusada, HMAC alterado/ausente, segredo de produção, repetição | pedidos: pix_cobranca_e_webhook; webhook_pix_rejeita_segredo | test_pagamento; test_assinatura; test_segredo_producao; test_pix_idempotente | JSON por teste |
| Entregas | API + sistema | Atribuição, outro entregador, saída antes de pronto, conclusão em ordem | pedidos: entregador_resumo_historico_aceite_duplicado_e_isolamento | test_compra_entrega_avaliacao | JSON por teste |
| Avaliações | Unidade + API + sistema | Notas 0/1/5/6; pedido inconcluso; duplicidade; outro titular | quatro testes em avaliacoes/tests.py | test_nota; test_compra_entrega_avaliacao | JSON por teste |
| Moderação/auditoria | API + sistema | Aprovar, suspender, ocultar, soft delete e logs | seis testes em painel/tests.py | test_admin_moderacao | JSON por teste |
| JWT, anti-IDOR e LGPD | API + sistema | Logout alheio, refresh revogado, exportação/exclusão, login inválido | usuarios/tests.py; pedidos: logout_e_recuperacao | test_login_invalido | JSON por teste |
| MySQL/concorrência | Banco específico | Disputa de lock/select_for_update | Não há execução MySQL nesta entrega | Não executado: sem servidor de teste seguro configurado | Pendente |

O inventário detalhado de classes, métodos, serviços e integrações está em [INVENTARIO_TESTES.md](INVENTARIO_TESTES.md). A cobertura por arquivo lista linhas e branches ausentes para orientar próximas regressões.

## Cobertura e limitações

A linha de base confirmou 42 aprovados, 0 falhas, 0 erros e 0 ignorados em 43,03 s: 2648/3042 linhas (87,05%) e 207/356 branches (58,15%). O escopo histórico inclui testes legados e migrações; os resultados finais mantêm esse escopo para comparação. A configuração exclusiva de testes é excluída. Isso não equivale à cobertura exclusiva do código de negócio. JavaScript não é instrumentado; os testes de sistema medem comportamento do navegador.

SQLite verifica persistência e rollback, mas não reproduz locks de MySQL. Uma validação MySQL exige serviço descartável, configuração própria e testes concorrentes com conexões separadas. Não há aprovação implícita desses cenários. Os fluxos de UI implementados não cobrem todas as combinações de dispositivo, acessibilidade, carga ou falhas de rede.

A configuração de CI foi alterada preservando checks de Django/schema/deploy, frontend e Docker. Instala Chromium e executa `make test-all`; `upload-artifact` usa `if: always()`. O exit code dos testes é preservado. O GitHub Actions não foi disparado nesta entrega local; lint frontend e Docker não foram executados aqui. Os pacotes do projeto têm faixas abertas, portanto `reports/testes/ambiente.txt` registra as versões efetivamente instaladas. Avisos de depreciação de e-mail no Django estão nos logs; não foram suprimidos.

## Referências e método

A classificação, fixtures, AAA, testes independentes, mocks e limites seguem os conceitos do [capítulo 8 de Engenharia de Software Moderna](https://engsoftmoderna.info/cap8.html). A referência [ESM-ExemplosCodigo/cap8](https://github.com/mtov/ESM-ExemplosCodigo/tree/master/cap8) foi indicada no roteiro, mas a ferramenta de consulta não recuperou seu conteúdo. Não foi fornecida uma captura JUnit junto ao ZIP; o painel interpreta a descrição textual, sem copiar imagens do livro.

## Reprodução da linha de base

A execução inicial usou `config.settings` original, SQLite, DEBUG habilitado e limites de throttle elevados para não confundir limitação de taxa com regressão funcional. Com os cinco arquivos originais preservados:

```bash
DJANGO_DEBUG=1 DB_ENGINE=sqlite THROTTLE_REGISTRO=10000/minute THROTTLE_LOGIN=10000/minute THROTTLE_RECUPERAR_SENHA=10000/minute \
coverage run --branch --source=usuarios,catalogo,pedidos,avaliacoes,painel,config -m pytest --ds=config.settings \
usuarios/tests.py catalogo/tests.py pedidos/tests.py avaliacoes/tests.py painel/tests.py --junitxml=baseline.xml -q
coverage json -o baseline-cobertura.json
```

Após a adição de `conftest.py`, esse comando também produz metadados; preserve o relatório final antes de repetir. O arquivo `.coveragerc` exclui apenas a configuração auxiliar `settings_test.py` para manter o denominador original comparável.

## Resultado da execução entregue

Execução completa: **125 aprovados, 0 falhas, 0 erros, 0 ignorados**, em **73,80 s**.

| Tipo | Executados | Aprovados | Falhas | Erros | Ignorados | Duração dos casos |
|---|---:|---:|---:|---:|---:|---:|
| Unidade | 68 | 68 | 0 | 0 | 0 | 0,14 s |
| Integração | 52 | 52 | 0 | 0 | 0 | 41,52 s |
| Sistema | 5 | 5 | 0 | 0 | 0 | 31,93 s |

Cobertura de linhas: **87,05% → 87,61%** (2665/3042). Branches: **58,15% → 62,36%** (222/356). Todos os 42 identificadores originais constam uma única vez na coleta final. Foram adicionados 83 casos, contando parametrizações distintas.

`manage.py check`, verificação de migrações e validação OpenAPI passaram. O painel abriu localmente, pesquisa/filtro foram verificados com Playwright e a captura foi inspecionada visualmente. Não há falhas pendentes na execução entregue nem PNG vermelho final. As falhas intermediárias da implementação dos testes estão separadas em `historico-desenvolvimento/`.

Nenhuma regra de negócio ou arquivo de produção foi alterado. Arquivos adicionados: testes por categoria, configuração pytest/coverage, settings exclusivos de teste, scripts de execução/relatório, template HTML, Makefile e documentação/inventário. Arquivos atualizados: requirements-dev.txt, .gitignore, README.md e .github/workflows/ci.yml. CI remoto e MySQL permanecem não executados.
