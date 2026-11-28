from django.contrib import admin

from .models import Avaliacao, AvaliacaoCliente, Reclamacao

admin.site.register(Avaliacao)
admin.site.register(AvaliacaoCliente)
admin.site.register(Reclamacao)
