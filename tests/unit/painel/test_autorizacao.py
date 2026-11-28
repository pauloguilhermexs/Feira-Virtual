from types import SimpleNamespace
import pytest
from usuarios.permissions import EhAdmin, AdminEscreveTodosLeem

@pytest.mark.parametrize("tipo,auth,expected", [("ADMIN",True,True),("CLIENTE",True,False),("PRODUTOR",True,False),("ENTREGADOR",True,False),("ADMIN",False,False)])
def test_admin(tipo,auth,expected):
    """Acesso administrativo: apenas ADMIN autenticado recebe autorização."""
    r=SimpleNamespace(user=SimpleNamespace(tipo=tipo,is_authenticated=auth),method="POST")
    assert EhAdmin().has_permission(r,None) is expected
    assert AdminEscreveTodosLeem().has_permission(r,None) is expected

@pytest.mark.parametrize("method", ["GET","HEAD","OPTIONS"])
def test_leitura_publica(method):
    """Leituras de categorias públicas dispensam autenticação."""
    assert AdminEscreveTodosLeem().has_permission(SimpleNamespace(method=method,user=None),None)

@pytest.mark.parametrize("forwarded,remote,expected", [("192.0.2.1, 192.0.2.2","127.0.0.1","192.0.2.1"),(None,"127.0.0.1","127.0.0.1")])
def test_auditoria_trunca_descricao(forwarded,remote,expected):
    """Auditoria limita descrição a 255 caracteres e seleciona IP conforme headers existentes."""
    from unittest.mock import patch
    from painel.views import registrar_auditoria
    user=object()
    request=SimpleNamespace(user=user,META={"HTTP_X_FORWARDED_FOR":forwarded,"REMOTE_ADDR":remote})
    with patch("painel.views.LogAuditoria.objects.create") as create:
        registrar_auditoria(request,"APROVAR_PRODUTOR","a"*256)
    create.assert_called_once_with(usuario=user,acao="APROVAR_PRODUTOR",descricao="a"*255,ip=expected)
