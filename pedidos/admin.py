from django.contrib import admin

from .models import Carrinho, ItemPedido, Pedido


class ItemInline(admin.TabularInline):
    model = ItemPedido
    extra = 0


@admin.register(Pedido)
class PedidoAdmin(admin.ModelAdmin):
    list_display = ["id", "cliente", "produtor", "status", "total", "criado_em"]
    list_filter = ["status", "modalidade"]
    inlines = [ItemInline]


admin.site.register(Carrinho)
