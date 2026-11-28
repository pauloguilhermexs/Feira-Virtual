from django.contrib import admin

from .models import Categoria, Produto

admin.site.register(Categoria)


@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = ["nome", "produtor", "categoria", "preco", "estoque", "ativo"]
    list_filter = ["ativo", "tipo_producao", "categoria"]
    search_fields = ["nome"]
