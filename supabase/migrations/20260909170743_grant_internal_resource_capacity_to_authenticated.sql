-- Necessario para o wrapper SECURITY INVOKER chamar a rotina interna.
-- O schema app nao e exposto pela Data API; a autorizacao continua sendo
-- verificada no RPC publico por app.can_manage_project(project_id).
grant execute on function app.calculate_resource_allocation_capacity(uuid, date, date, numeric, uuid)
to authenticated;
