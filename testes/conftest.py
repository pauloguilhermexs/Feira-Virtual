import inspect
import json
from pathlib import Path
import pytest


def pytest_collection_modifyitems(items):
    for item in items:
        path = str(item.path)
        kind = "unit" if "/tests/unit/" in path else "system" if "/tests/system/" in path else "integration"
        item.add_marker(getattr(pytest.mark, kind))
        item.user_properties.append(("nodeid", item.nodeid))


def pytest_collection_finish(session):
    metadata = {}
    root = Path(session.config.rootpath)
    for item in session.items:
        path = str(item.path.relative_to(root))
        kind = "unit" if path.startswith("tests/unit/") else "system" if path.startswith("tests/system/") else "integration"
        module = next((m for m in ("usuarios", "catalogo", "pedidos", "avaliacoes", "painel") if m in path), "pedidos")
        if kind == "system":
            module = {"test_cadastro_cliente": "usuarios", "test_login_invalido": "usuarios", "test_admin_moderacao": "painel", "test_vitrine_busca_filtro": "catalogo"}.get(item.name, "pedidos")
        metadata[item.nodeid] = {"arquivo": path, "metodo": item.name, "classe": item.cls.__name__ if item.cls else "Funções",
                                 "tipo": kind, "modulo": module, "descricao": inspect.getdoc(item.obj) or "Sem docstring no teste original; consulte o código-fonte.",
                                 "codigo": inspect.getsource(item.obj), "fixtures": list(item.fixturenames), "precondicoes": inspect.getsource(item.cls.setUp) if item.cls and hasattr(item.cls, "setUp") else "Fixtures: " + ", ".join(item.fixturenames)}
    out = root / "reports/testes"
    out.mkdir(parents=True, exist_ok=True)
    (out / "metadados.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2))


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    setattr(item, "rep_" + outcome.get_result().when, outcome.get_result())
