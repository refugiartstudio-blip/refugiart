# RefugiART — auditoria de Storage do Supabase

Data: 31/10/2026  
Escopo: buckets, políticas RLS de `storage.objects`, grants SQL e uso no frontend. Consultas realizadas em modo somente leitura.

## Buckets encontrados

| Bucket | Público | Arquivos encontrados | Limite/tipos no bucket |
|---|---:|---:|---|
| `artwork-images` | Sim | 12 | Sem limite/tipos configurados |
| `profile-photos` | Sim | 3 | Sem limite/tipos configurados |
| `Public` | Sim | 0 | Sem limite/tipos configurados |

Os dois primeiros buckets são usados pelo frontend para gerar URLs públicas. A visibilidade pública é compatível com a exibição de obras e fotos de perfil no marketplace, mas significa que quem obtiver a URL pode visualizar o arquivo. Não tornar privados sem planejar a migração das URLs e do modo de entrega.

## Policies observadas em `storage.objects`

- `artwork-images`: INSERT, UPDATE e DELETE para `authenticated`, restritos ao primeiro segmento do caminho igual a `auth.uid()`.
- `profile-photos`: INSERT e UPDATE para `authenticated`, também restritos à pasta do próprio usuário.
- Não foi observada policy SELECT para `artwork-images`; a leitura pública decorre da configuração de bucket público.
- A policy SELECT de `profile-photos` restringe consulta autenticada à própria pasta, mas bucket público permite leitura por URL pública.
- Não foi observada policy DELETE para `profile-photos`.
- Não foram observadas policies para o bucket `Public`.

## Grants SQL observados

A consulta a `information_schema.role_table_grants` mostrou SELECT, INSERT, UPDATE e DELETE para `anon` e `authenticated` na tabela `storage.objects`. `service_role` também possui os privilégios administrativos esperados.

Esses grants, isoladamente, não provam que chamadas anônimas consigam escrever ou apagar objetos: as policies RLS e o predicado de cada operação também controlam o acesso. Não foi observada policy de escrita para `anon`. Não revogar grants de Storage sem avaliar o comportamento integrado do Supabase Storage e testar upload/leitura/exclusão.

## Verificação do frontend

- `atelie.js` envia obras para `artwork-images`, no caminho `<user.id>/<timestamp>-<uuid>.<ext>`; aceita JPEG, PNG e WEBP; usa `getPublicUrl`.
- `perfil.js` envia fotos para `profile-photos`, no caminho `<user.id>/perfil-<timestamp>.<ext>`; aceita JPEG, PNG, WEBP e GIF; usa `getPublicUrl`.
- Os dois fluxos limitam arquivo a 5 MB no frontend. Isso não substitui limite e validação no servidor.
- Busca no código por referência explícita ao bucket `Public` não retornou resultado. O bucket está vazio segundo a consulta de contagem, mas não deve ser excluído sem uma busca completa/confirmatória e avaliação de dependências externas.

## Riscos e ações recomendadas

1. Configurar limites de tamanho no servidor, compatíveis com a experiência atual (5 MB), após validar o impacto.
2. Restringir MIME types no bucket para os formatos realmente usados. Atenção: `profile-photos` aceita GIF no frontend.
3. Avaliar se a ausência de DELETE para foto de perfil é intencional; hoje o frontend cria nova foto e não remove a anterior, o que pode acumular arquivos órfãos.
4. Verificar se a substituição de foto deve apagar a antiga somente após o perfil salvar com sucesso, com tratamento de falhas.
5. Fazer inventário de objetos sem referência em `profiles.foto_url` ou `atelie_posts.image_url` antes de qualquer limpeza.
6. Revisar grants e policies Storage em ambiente de homologação antes de qualquer REVOKE.
7. Confirmar se o bucket `Public` é legado; manter intacto enquanto não houver certeza.

## Status

Auditoria somente leitura concluída para os dados apresentados. Nenhum bucket, objeto, grant ou policy foi alterado. Nenhuma migration de Storage foi executada. Os resultados não equivalem a teste de penetração nem a homologação funcional.
