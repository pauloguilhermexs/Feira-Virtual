from django.contrib.auth.models import AbstractUser
from django.db import models


class Usuario(AbstractUser):
    class Tipo(models.TextChoices):
        CLIENTE = "CLIENTE", "Cliente"
        PRODUTOR = "PRODUTOR", "Produtor rural"
        ENTREGADOR = "ENTREGADOR", "Entregador"
        ADMIN = "ADMIN", "Administrador"

    email = models.EmailField("e-mail", unique=True)
    tipo = models.CharField(max_length=12, choices=Tipo.choices, default=Tipo.CLIENTE)
    telefone = models.CharField(max_length=20, blank=True)

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.tipo = self.Tipo.ADMIN
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.tipo})"


class PerfilProdutor(models.Model):
    class Status(models.TextChoices):
        PENDENTE = "PENDENTE", "Pendente de aprovação"
        APROVADO = "APROVADO", "Aprovado"
        SUSPENSO = "SUSPENSO", "Suspenso"

    usuario = models.OneToOneField(Usuario, on_delete=models.CASCADE, related_name="perfil_produtor")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDENTE)
    # Propriedade
    nome_propriedade = models.CharField(max_length=150)
    descricao = models.TextField(blank=True)
    endereco_propriedade = models.CharField(max_length=255, blank=True)
    cidade = models.CharField(max_length=100, blank=True)
    estado = models.CharField(max_length=2, blank=True)
    foto_propriedade = models.ImageField(upload_to="propriedades/%Y/%m/", blank=True, null=True)
    # Formas de recebimento
    chave_pix = models.CharField(max_length=140, blank=True)
    possui_maquininha = models.BooleanField(default=False)
    aceita_dinheiro = models.BooleanField(default=True)

    def __str__(self):
        return self.nome_propriedade


class PerfilEntregador(models.Model):
    usuario = models.OneToOneField(Usuario, on_delete=models.CASCADE, related_name="perfil_entregador")
    veiculo = models.CharField(max_length=60, blank=True)
    placa = models.CharField(max_length=10, blank=True)
    area_atuacao = models.CharField(max_length=150, blank=True)


class Endereco(models.Model):
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name="enderecos")
    rotulo = models.CharField(max_length=40, default="Casa")
    cep = models.CharField(max_length=9, blank=True)
    logradouro = models.CharField(max_length=200)
    numero = models.CharField(max_length=10)
    complemento = models.CharField(max_length=100, blank=True)
    bairro = models.CharField(max_length=100)
    cidade = models.CharField(max_length=100)
    estado = models.CharField(max_length=2)

    def __str__(self):
        return self.como_texto()

    def como_texto(self):
        comp = f", {self.complemento}" if self.complemento else ""
        return f"{self.logradouro}, {self.numero}{comp} - {self.bairro}, {self.cidade}/{self.estado} {self.cep}".strip()
