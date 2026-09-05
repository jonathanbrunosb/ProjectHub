#!/usr/bin/env bash
# =============================================================================
# Executa o schema completo + seed + testes (RLS e regras de negocio) contra um
# PostgreSQL limpo. Usado no CI e reproduzivel localmente.
#
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres ./supabase/tests/run.sh
# =============================================================================
set -euo pipefail

DB_URL="${DATABASE_URL:?Defina DATABASE_URL}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL="psql $DB_URL -v ON_ERROR_STOP=1 -q"

echo "==> Recriando o schema public"
$PSQL -c "drop schema if exists public cascade; create schema public;" \
      -c "drop schema if exists app cascade;" \
      -c "drop schema if exists auth cascade; drop schema if exists storage cascade;"

echo "==> Aplicando o shim do ambiente Supabase"
$PSQL -f "$ROOT/supabase/tests/00_supabase_shim.sql"

echo "==> Aplicando as migrations"
for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "    - $(basename "$file")"
  $PSQL -f "$file"
done

echo "==> Carregando o seed demonstrativo"
$PSQL -f "$ROOT/supabase/seed.sql"

echo "==> Testes de RLS"
$PSQL -f "$ROOT/supabase/tests/01_rls_tests.sql"

echo "==> Recarregando dados para os testes de regras de negocio"
$PSQL -c "drop schema if exists public cascade; create schema public;" \
      -c "drop schema if exists app cascade;" \
      -c "drop schema if exists auth cascade; drop schema if exists storage cascade;"
$PSQL -f "$ROOT/supabase/tests/00_supabase_shim.sql"
for file in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$file"; done
$PSQL -f "$ROOT/supabase/seed.sql"

echo "==> Testes de regras de negocio"
$PSQL -f "$ROOT/supabase/tests/02_business_rules.sql"

echo "==> Recarregando dados para os testes de ambiente"
$PSQL -c "drop schema if exists public cascade; create schema public;" \
      -c "drop schema if exists app cascade;" \
      -c "drop schema if exists auth cascade; drop schema if exists storage cascade;"
$PSQL -f "$ROOT/supabase/tests/00_supabase_shim.sql"
for file in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$file"; done
$PSQL -f "$ROOT/supabase/seed.sql"

echo "==> Testes de segregacao de ambientes"
$PSQL -f "$ROOT/supabase/tests/03_environment.sql"

echo "==> Todos os testes de banco passaram."
