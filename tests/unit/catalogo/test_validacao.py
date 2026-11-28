from decimal import Decimal
from io import BytesIO
import pytest
from PIL import Image
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from catalogo.models import Produto, Categoria
from catalogo.serializers import ProdutoProdutorSerializer
from rest_framework.exceptions import ValidationError as APIValidationError
from config.validators import validar_imagem_upload, MAX_UPLOAD_SIZE

@pytest.mark.parametrize("field,value,valid", [("preco","0.01",True),("preco","0",False),("preco","-1",False),("estoque","0",True),("estoque","-0.001",False),("estoque","0.001",True),("unidade_medida","KG",True),("unidade_medida","INVALIDA",False)])
def test_campos(field,value,valid):
    """Validar limites de preço, estoque e escolha de unidade sem gravar no banco."""
    f=Produto._meta.get_field(field)
    if valid:
        f.clean(value,Produto())
    else:
        with pytest.raises(ValidationError): f.clean(value,Produto())

@pytest.mark.parametrize("ativa", [True,False])
def test_categoria(ativa):
    """Categoria ativa é aceita; inativa provoca erro de validação."""
    c=Categoria(ativa=ativa)
    if ativa: assert ProdutoProdutorSerializer().validate_categoria(c) is c
    else:
        with pytest.raises(APIValidationError): ProdutoProdutorSerializer().validate_categoria(c)

@pytest.mark.parametrize("caso", ["valido","extensao","conteudo","tamanho"])
def test_upload(caso):
    """Imagem PNG válida é aceita; extensão, conteúdo ou tamanho inválidos são rejeitados."""
    buf=BytesIO(); Image.new("RGB",(2,2)).save(buf,format="PNG")
    f=SimpleUploadedFile("a.exe" if caso=="extensao" else "a.png", b"falso" if caso=="conteudo" else buf.getvalue())
    if caso=="tamanho": f.size=MAX_UPLOAD_SIZE+1
    if caso=="valido": validar_imagem_upload(f); assert f.tell()==0
    else:
        with pytest.raises(ValidationError): validar_imagem_upload(f)
