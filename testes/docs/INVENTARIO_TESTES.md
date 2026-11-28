# Inventário de unidades e integrações

Gerado por análise AST do código Python do ZIP. Inventário não implica cobertura. Métodos triviais e migrações não são metas individuais de teste.

## usuarios/admin.py

- UsuarioAdmin: campos declarativos / comportamento herdado

## usuarios/apps.py

- UsuariosConfig: campos declarativos / comportamento herdado

## usuarios/models.py

- Usuario: save, __str__
- PerfilProdutor: __str__
- PerfilEntregador: campos declarativos / comportamento herdado
- Endereco: __str__, como_texto

## usuarios/permissions.py

- _PorTipo: has_permission
- EhCliente: campos declarativos / comportamento herdado
- EhProdutor: campos declarativos / comportamento herdado
- EhEntregador: campos declarativos / comportamento herdado
- EhAdmin: campos declarativos / comportamento herdado
- AdminEscreveTodosLeem: has_permission

## usuarios/serializers.py

- PerfilProdutorSerializer: validate_foto_propriedade
- PerfilEntregadorSerializer: campos declarativos / comportamento herdado
- UsuarioSerializer: campos declarativos / comportamento herdado
- UsuarioAdminSerializer: campos declarativos / comportamento herdado
- RegistroBaseSerializer: validate_password, create, criar_perfil
- RegistroClienteSerializer: campos declarativos / comportamento herdado
- RegistroProdutorSerializer: validate_foto_propriedade, criar_perfil
- RegistroEntregadorSerializer: criar_perfil
- EnderecoSerializer: campos declarativos / comportamento herdado
- RecuperarSenhaSerializer: campos declarativos / comportamento herdado
- RedefinirSenhaSerializer: campos declarativos / comportamento herdado
- LogoutSerializer: campos declarativos / comportamento herdado

## usuarios/views.py

- _obter_ip (linha 28)
- LoginRateThrottle: campos declarativos / comportamento herdado
- RegistroRateThrottle: campos declarativos / comportamento herdado
- RecuperarSenhaRateThrottle: campos declarativos / comportamento herdado
- CustomTokenObtainPairView: campos declarativos / comportamento herdado
- RegistroClienteView: campos declarativos / comportamento herdado
- RegistroProdutorView: campos declarativos / comportamento herdado
- RegistroEntregadorView: campos declarativos / comportamento herdado
- LogoutView: post
- RecuperarSenhaView: post
- RedefinirSenhaView: post
- MeuPerfilView: get_object
- PerfilProdutorView: get_object
- PerfilEntregadorView: get_object
- EnderecoViewSet: get_queryset, perform_create
- ExportarDadosLGPDView: get
- ExcluirContaLGPDView: delete

## catalogo/admin.py

- ProdutoAdmin: campos declarativos / comportamento herdado

## catalogo/apps.py

- CatalogoConfig: campos declarativos / comportamento herdado

## catalogo/models.py

- Categoria: __str__
- Produto: __str__

## catalogo/serializers.py

- ProdutorPublicoSerializer: get_cidade_uf, get_aceita_pix
- EstatisticasPublicasSerializer: campos declarativos / comportamento herdado
- CategoriaSerializer: campos declarativos / comportamento herdado
- ProdutoPublicoSerializer: campos declarativos / comportamento herdado
- ProdutoProdutorSerializer: validate_categoria, validate_imagem

## catalogo/views.py

- ProdutorPublicoViewSet: get_queryset
- EstatisticasPublicasView: get
- CategoriaViewSet: get_queryset, destroy
- CatalogoViewSet: get_queryset
- ProdutoProdutorViewSet: get_queryset, perform_create

## pedidos/admin.py

- ItemInline: campos declarativos / comportamento herdado
- PedidoAdmin: campos declarativos / comportamento herdado

## pedidos/apps.py

- PedidosConfig: campos declarativos / comportamento herdado

## pedidos/models.py

- gerar_numero_publico (linha 10)
- Carrinho: total
- ItemCarrinho: subtotal
- Pedido: save, total_com_frete
- ItemPedido: subtotal
- HistoricoStatus: campos declarativos / comportamento herdado

## pedidos/notificacoes.py

- NotificadorBase: notificar
- NotificadorEmail: notificar
- NotificadorWhatsApp: notificar
- CentralNotificacoes: __init__, disparar

## pedidos/pix.py

- GatewayPixBase: gerar_cobranca, validar_assinatura_webhook
- MockPixGateway: _obter_segredo, gerar_cobranca, validar_assinatura_webhook
- obter_gateway_pix (linha 74)

## pedidos/serializers.py

- _resumir_endereco_entregador (linha 21)
- ItemCarrinhoSerializer: get_aceita_pix, get_fields, validate
- CarrinhoSerializer: campos declarativos / comportamento herdado
- ItemPedidoSerializer: campos declarativos / comportamento herdado
- HistoricoSerializer: campos declarativos / comportamento herdado
- PedidoSerializer: get_cliente_nome, get_endereco_entrega, get_endereco_resumido, get_local_retirada, get_concluido_em, get_cliente_avaliado, get_avaliacoes_feitas, get_chave_pix
- CheckoutSerializer: validate
- StatusSerializer: campos declarativos / comportamento herdado

## pedidos/services.py

- validar_pagamento (linha 25)
- _registrar (linha 34)
- finalizar_carrinho (linha 39)
- _baixar_estoque (linha 105)
- _devolver_estoque (linha 117)
- mudar_status (linha 127)

## pedidos/views.py

- _carrinho (linha 26)
- CarrinhoView: get, delete
- ItemCarrinhoViewSet: get_queryset, get_serializer_context, create
- PedidoClienteViewSet: get_queryset, create, cancelar, pix
- PedidoProdutorViewSet: get_queryset, _mudar, aceitar, recusar, status, vendas, resumo
- EntregaViewSet: get_queryset, resumo, aceitar, saiu_para_entrega, confirmar
- PixWebhookView: post

## avaliacoes/apps.py

- AvaliacoesConfig: campos declarativos / comportamento herdado

## avaliacoes/models.py

- Avaliacao: campos declarativos / comportamento herdado
- Reclamacao: campos declarativos / comportamento herdado
- AvaliacaoCliente: campos declarativos / comportamento herdado

## avaliacoes/serializers.py

- AvaliacaoSerializer: get_fields, get_cliente_nome, get_tipo_avaliacao, validate
- ReclamacaoSerializer: validate_pedido
- ReclamacaoAdminSerializer: campos declarativos / comportamento herdado
- AvaliacaoClienteSerializer: get_cliente_nome, validate_pedido

## avaliacoes/views.py

- AvaliacaoViewSet: get_permissions, perform_create, _garantir_autor, perform_update, perform_destroy, minhas
- AvaliacaoProdutorViewSet: get_queryset
- AvaliacaoClienteProdutorViewSet: get_queryset, perform_create
- ReclamacaoViewSet: get_queryset, perform_create

## painel/apps.py

- PainelConfig: campos declarativos / comportamento herdado

## painel/models.py

- LogAuditoria: __str__

## painel/views.py

- registrar_auditoria (linha 25)
- ProdutorAdminSerializer: campos declarativos / comportamento herdado
- ProdutoAdminSerializer: campos declarativos / comportamento herdado
- UsuarioAdminViewSet: get_queryset, _alterar, bloquear, reativar, detalhes, destroy
- ProdutorAdminViewSet: get_queryset, _status, aprovar, suspender, detalhes, destroy
- ProdutoAdminViewSet: perform_update, ocultar, reexibir, destroy
- PedidoAdminViewSet: campos declarativos / comportamento herdado
- ReclamacaoAdminViewSet: perform_update
- AvaliacaoAdminViewSet: campos declarativos / comportamento herdado
- AvaliacaoClienteAdminViewSet: campos declarativos / comportamento herdado
- IndicadoresView: get

## config/middleware.py

- ContentSecurityPolicyMiddleware: __init__, __call__

## config/urls.py

- frontend_assets_view (linha 13)
- health_view (linha 45)
- media_serve_view (linha 62)
- config_publica_view (linha 82)

## config/validators.py

- validar_imagem_upload (linha 9)

## Integrações reais

- API DRF → serializers → ORM SQLite: cadastro, perfis, catálogo, carrinho, checkout, avaliações e moderação.
- JWT → login, refresh, blacklist/logout e isolamento de titular.
- Serviços → transações, histórico, estoque, snapshots e notificadores de e-mail (backend local nos testes).
- Gateway Pix mock → HMAC → webhook → mudança de status e baixa de estoque. Nenhum pagamento real.
- Frontend ES modules → fetch/JWT → API → banco de teste → atualização da interface.
- MySQL/select_for_update: implementação presente, mas locks/concorrência não validados por SQLite.