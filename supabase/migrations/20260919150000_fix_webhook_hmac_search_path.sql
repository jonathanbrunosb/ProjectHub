-- =============================================================================
-- Corrige search_path de app.webhook_post: hmac() nao e' resolvido no Supabase hospedado
--
-- app.webhook_post (20260919130000) tinha `set search_path = app, net`. No
-- Postgres puro (CI/local), `create extension pgcrypto` sem schema explicito
-- cai em `public`, que o search_path padrao da sessao ja alcanca - por isso
-- a suite local nunca pegou o problema. No Supabase hospedado, pgcrypto (e
-- hmac()) vive no schema `extensions`, fora do search_path da funcao -
-- confirmado ao vivo em QA: `test_webhook_delivery()` falhava com
-- "function hmac(bytea, bytea, unknown) does not exist" ao tentar assinar o
-- payload com segredo configurado (o caminho sem segredo nunca chama hmac,
-- entao passava despercebido).
-- =============================================================================

create or replace function app.webhook_post(p_url text, p_secret text, p_payload jsonb)
returns void language plpgsql security definer set search_path = app, net, extensions as $$
declare
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
begin
  if p_secret is not null and p_secret <> '' then
    v_headers := v_headers || jsonb_build_object(
      'X-ProjectHub-Signature',
      'sha256=' || encode(hmac(p_payload::text::bytea, p_secret::bytea, 'sha256'), 'hex')
    );
  end if;
  perform net.http_post(url := p_url, body := p_payload, headers := v_headers);
end $$;
revoke all on function app.webhook_post(text, text, jsonb) from public, anon, authenticated;
