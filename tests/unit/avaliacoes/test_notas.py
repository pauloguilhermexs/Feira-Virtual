import pytest
from rest_framework.exceptions import ValidationError
from avaliacoes.serializers import AvaliacaoSerializer, AvaliacaoClienteSerializer

@pytest.mark.parametrize("serializer", [AvaliacaoSerializer,AvaliacaoClienteSerializer])
@pytest.mark.parametrize("nota,valid", [(0,False),(1,True),(5,True),(6,False)])
def test_nota(serializer,nota,valid):
    """Notas 1 e 5 são limites válidos; 0 e 6 devem ser rejeitados."""
    field=serializer().fields["nota"]
    if valid: assert field.run_validation(nota)==nota
    else:
        with pytest.raises(ValidationError): field.run_validation(nota)
