from rest_framework.permissions import SAFE_METHODS, BasePermission


class _PorTipo(BasePermission):
    tipo = None

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.tipo == self.tipo)


class EhCliente(_PorTipo):
    tipo = "CLIENTE"


class EhProdutor(_PorTipo):
    tipo = "PRODUTOR"


class EhEntregador(_PorTipo):
    tipo = "ENTREGADOR"


class EhAdmin(_PorTipo):
    tipo = "ADMIN"


class AdminEscreveTodosLeem(BasePermission):
    """Leitura pública; escrita apenas para administradores."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        u = request.user
        return bool(u and u.is_authenticated and u.tipo == "ADMIN")
