PYTHON ?= python3
.PHONY: test-unit test-integration test-system test-all test-coverage test-report
test-unit:
	$(PYTHON) scripts/executar_testes.py unit
test-integration:
	$(PYTHON) scripts/executar_testes.py integration
test-system:
	$(PYTHON) scripts/executar_testes.py system
test-all:
	$(PYTHON) scripts/executar_testes.py all
test-coverage: test-all
test-report:
	$(PYTHON) scripts/gerar_relatorio_testes.py
