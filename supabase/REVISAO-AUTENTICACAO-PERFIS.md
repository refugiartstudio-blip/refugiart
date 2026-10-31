# RefugiART — auditoria de autenticação e perfis

Data: 31/10/2026  
Escopo: leitura estática de `login.html`, `perfil.html`, `perfil.js` e resultados somente leitura do Supabase.

## Resultado

O cadastro de usuário no Supabase Auth e a criação do perfil público são dois fluxos separados. O frontend chama `supabase.auth.signUp()`, mas não foi encontrada trigger em `auth.users` nem rotina personalizada com nome relacionado a signup/register/cadastro/profile nas consultas realizadas. O registro em `public.profiles` é criado/atualizado depois, pela página `perfil.html`, via `upsert()`.

## Achados confirmados

1. **Cadastro Auth:** `login.html` chama `supabase.auth.signUp({ email, password, options: { data: { nome, tipo_conta } } })`. O nome e o tipo de conta são gravados em user metadata. O fluxo redireciona para `atelie.html` quando a resposta contém sessão; sem sessão, orienta a pessoa a confirmar o e-mail.
2. **Sem criação automática de perfil observada:** as consultas a `information_schema.triggers` para `auth.users` e `public.profiles` não retornaram triggers. A busca por rotinas com nomes signup/register/cadastro/profile também não retornou linhas. Isso não exclui funções com nomes genéricos ou lógica em serviços externos, mas nenhuma automação de perfil foi encontrada.
3. **Perfil salvo pelo navegador:** `perfil.js` carrega `profiles` por `id = auth.uid()` e salva com `upsert(perfil, { onConflict: 'id' })`.
4. **Campo obrigatório ausente no upsert:** o banco foi inspecionado e `profiles.area_atuacao` é NOT NULL. O objeto enviado pelo `perfil.js` contém `id`, `nome_artistico`, `nome_atelie`, `biografia`, `foto_url` e `updated_at`, mas não contém `area_atuacao`. O formulário `perfil.html` também não apresenta campo para área de atuação.
5. **Metadados não correspondem diretamente ao campo:** no cadastro, `tipo_conta` recebe `apreciador`, `artista` ou `educador`; a coluna do banco chama-se `area_atuacao`. O código atual não mapeia explicitamente `user_metadata.tipo_conta` para `profiles.area_atuacao`.
6. **Grants ausentes no estado consultado:** os resultados do inventário de grants para `public.profiles` mostraram que `anon` e `authenticated` não têm privilégios SQL de SELECT, INSERT ou UPDATE. As policies RLS existentes não substituem grants. Assim, o frontend que consulta e executa upsert pode receber erro de permissão, mesmo quando a policy permitiria a linha.
7. **Policies redundantes:** existem policies duplicadas de INSERT, UPDATE e SELECT para membros autenticados, além de uma policy pública de SELECT. Não remover sem revisão de intenção e teste; policies permissivas podem combinar-se por OR.
8. **FK ausente:** a consulta de chaves estrangeiras não encontrou FK de `profiles.id` para `auth.users.id`. A integridade entre as contas Auth e os perfis não está garantida por essa constraint no estado consultado.

## Impacto provável

O cadastro Auth pode ser criado com sucesso, mas isso não prova que o perfil público correspondente exista. Ao abrir `perfil.html`, a tentativa de consultar ou salvar o perfil pode falhar por grants ausentes. Mesmo após corrigir grants, um INSERT/upsert de novo perfil pode falhar porque `area_atuacao` é NOT NULL e o frontend não envia valor nem existe default confirmado.

## Correções necessárias — ainda não aplicadas

- Decidir o significado de `area_atuacao`: se deve representar o tipo de conta (`apreciador`, `artista`, `educador`) ou uma área artística livre. Não mapear automaticamente sem essa decisão de produto.
- Definir um fluxo consistente de criação do perfil: trigger segura após signup ou criação explícita no frontend/backend. Considerar confirmação de e-mail e o fato de que o signup pode não retornar sessão.
- Corrigir o campo obrigatório e o formulário/upsert de acordo com a decisão acima.
- Preparar grants mínimos para SELECT/INSERT/UPDATE e revisar RLS; não conceder privilégios amplos.
- Avaliar FK `profiles.id → auth.users.id` com `ON DELETE CASCADE`, verificando primeiro dados órfãos e política de exclusão.
- Consolidar policies duplicadas somente após teste com usuário anônimo, usuário autenticado e terceiro.
- Testar cadastro com confirmação de e-mail ativada e desativada, primeiro login, criação do perfil, atualização, logout e exclusão de conta.

## Status

**Auditoria estática e consultas de leitura concluídas para os pontos descritos.** Nenhuma alteração foi feita no Supabase. Nenhuma correção de código foi publicada nesta etapa. Não considerar autenticação/perfis homologados até aplicar correções e testar no ambiente Supabase.


## Correções preparadas no GitHub — 31/10/2026

Após a revisão, foram publicados:
- `perfil.html`: campo obrigatório “Como você participa da RefugiART?” com opções apreciador, artista ou educador.
- `perfil.js`: carrega o valor salvo em `profiles.area_atuacao`, usando `user_metadata.tipo_conta` como preenchimento inicial quando ainda não há valor salvo, e envia `area_atuacao` no upsert.
- `migrations/20261031_017_profiles_minimal_client_grants.sql`: concede SELECT a anon/authenticated e INSERT/UPDATE somente a authenticated. A migration depende das policies RLS já verificadas para limitar a escrita ao próprio perfil.

Commits:
- perfil.html: `9ff683e05a5790a0d4abbd54b6f376bd1247d381`
- perfil.js: `9b47fc9c760c70043de3321869fa754ff1622f93`
- migration 017: `7913b14091d6a044d0e0531969e4975d2ec9deee`

**Importante:** os arquivos estão no GitHub, mas a migration 017 ainda não foi executada no Supabase. As mudanças de interface/código também precisam ser testadas no site publicado. Nenhuma alteração foi feita diretamente no banco.
