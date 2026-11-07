from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Endereco, PerfilEntregador, PerfilProdutor, Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Feira Virtual", {"fields": ("tipo", "telefone")}),)
    list_display = ["username", "email", "tipo", "is_active"]
    list_filter = ["tipo", "is_active"]


admin.site.register(PerfilProdutor)
admin.site.register(PerfilEntregador)
admin.site.register(Endereco)
