from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .models import Endereco, PerfilEntregador, PerfilProdutor, Usuario


class PerfilProdutorSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerfilProdutor
        fields = ["id", "status", "nome_propriedade", "descricao", "endereco_propriedade",
                  "cidade", "estado", "chave_pix", "possui_maquininha", "aceita_dinheiro"]
        read_only_fields = ["status"]


class PerfilEntregadorSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerfilEntregador
        fields = ["id", "veiculo", "placa", "area_atuacao"]


class UsuarioSerializer(serializers.ModelSerializer):
    """Dados do próprio usuário (edição de perfil)."""
    perfil_produtor = PerfilProdutorSerializer(read_only=True)
    perfil_entregador = PerfilEntregadorSerializer(read_only=True)

    class Meta:
        model = Usuario
        fields = ["id", "username", "email", "first_name", "last_name", "telefone", "tipo",
                  "perfil_produtor", "perfil_entregador"]
        read_only_fields = ["username", "tipo"]


class UsuarioAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ["id", "username", "email", "first_name", "last_name", "telefone", "tipo",
                  "is_active", "date_joined"]
        read_only_fields = fields


class RegistroBaseSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    tipo_fixo = None
    campos_perfil = ()

    class Meta:
        model = Usuario
        fields = ["id", "username", "email", "first_name", "last_name", "telefone", "password"]

    def validate_password(self, value):
        validate_password(value)
        return value

    @transaction.atomic
    def create(self, validated_data):
        senha = validated_data.pop("password")
        dados_perfil = {c: validated_data.pop(c) for c in self.campos_perfil if c in validated_data}
        user = Usuario(**validated_data, tipo=self.tipo_fixo)
        user.set_password(senha)
        user.save()
        self.criar_perfil(user, dados_perfil)
        return user

    def criar_perfil(self, user, dados):
        pass


class RegistroClienteSerializer(RegistroBaseSerializer):
    tipo_fixo = Usuario.Tipo.CLIENTE


class RegistroProdutorSerializer(RegistroBaseSerializer):
    tipo_fixo = Usuario.Tipo.PRODUTOR
    campos_perfil = ("nome_propriedade", "descricao", "endereco_propriedade", "cidade", "estado",
                     "chave_pix", "possui_maquininha", "aceita_dinheiro")
    nome_propriedade = serializers.CharField(write_only=True)
    descricao = serializers.CharField(write_only=True, required=False, allow_blank=True)
    endereco_propriedade = serializers.CharField(write_only=True, required=False, allow_blank=True)
    cidade = serializers.CharField(write_only=True, required=False, allow_blank=True)
    estado = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=2)
    chave_pix = serializers.CharField(write_only=True, required=False, allow_blank=True)
    possui_maquininha = serializers.BooleanField(write_only=True, required=False)
    aceita_dinheiro = serializers.BooleanField(write_only=True, required=False)

    class Meta(RegistroBaseSerializer.Meta):
        fields = RegistroBaseSerializer.Meta.fields + [
            "nome_propriedade", "descricao", "endereco_propriedade", "cidade", "estado",
            "chave_pix", "possui_maquininha", "aceita_dinheiro"]

    def criar_perfil(self, user, dados):
        PerfilProdutor.objects.create(usuario=user, **dados)


class RegistroEntregadorSerializer(RegistroBaseSerializer):
    tipo_fixo = Usuario.Tipo.ENTREGADOR
    campos_perfil = ("veiculo", "placa", "area_atuacao")
    veiculo = serializers.CharField(write_only=True, required=False, allow_blank=True)
    placa = serializers.CharField(write_only=True, required=False, allow_blank=True)
    area_atuacao = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta(RegistroBaseSerializer.Meta):
        fields = RegistroBaseSerializer.Meta.fields + ["veiculo", "placa", "area_atuacao"]

    def criar_perfil(self, user, dados):
        PerfilEntregador.objects.create(usuario=user, **dados)


class EnderecoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Endereco
        fields = ["id", "rotulo", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "estado"]


class RecuperarSenhaSerializer(serializers.Serializer):
    email = serializers.EmailField()


class RedefinirSenhaSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    nova_senha = serializers.CharField(write_only=True)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
