from types import SimpleNamespace
import pytest
from django.test import SimpleTestCase
from usuarios.models import Endereco
from usuarios.permissions import EhCliente, EhProdutor, EhEntregador

class EnderecoTests(SimpleTestCase):
    def test_complemento_cep(self):
        """Endereço com complemento e CEP: formatar preservando os componentes."""
        e = Endereco(logradouro="Rua A", numero="2", complemento="Casa B", bairro="Centro", cidade="Natal", estado="RN", cep="59000-000")
        self.assertEqual(e.como_texto(), "Rua A, 2, Casa B - Centro, Natal/RN 59000-000")

    def test_sem_opcionais(self):
        """Endereço sem opcionais: não acrescentar vírgula ou espaço final."""
        e = Endereco(logradouro="Rua A", numero="2", bairro="Centro", cidade="Natal", estado="RN")
        self.assertEqual(e.como_texto(), "Rua A, 2 - Centro, Natal/RN")

@pytest.mark.parametrize("permission,tipo", [(EhCliente,"CLIENTE"),(EhProdutor,"PRODUTOR"),(EhEntregador,"ENTREGADOR")])
@pytest.mark.parametrize("autenticado,correto", [(True,True),(False,True),(True,False)])
def test_perfil(permission,tipo,autenticado,correto):
    """Perfil correto autenticado é permitido; anônimo ou perfil diferente é negado."""
    request=SimpleNamespace(user=SimpleNamespace(is_authenticated=autenticado,tipo=tipo if correto else "ADMIN"))
    assert permission().has_permission(request,None) is (autenticado and correto)

@pytest.mark.parametrize("senha,valid", [("123",False),("12345678",False),("Senha-Ficticia-Que-Passa-123",True)])
def test_senha(senha,valid):
    """Cadastro rejeita senha curta/numérica e aceita senha forte fictícia."""
    from usuarios.serializers import RegistroClienteSerializer
    from django.core.exceptions import ValidationError
    if valid: assert RegistroClienteSerializer().validate_password(senha)==senha
    else:
        with pytest.raises(ValidationError): RegistroClienteSerializer().validate_password(senha)
