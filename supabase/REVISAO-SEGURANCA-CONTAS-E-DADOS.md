# RefugiART — revisão de segurança de contas, dados e moderação

Data da revisão: 2026-10-31
Escopo: leitura estática dos arquivos do repositório. Nenhuma policy foi testada em Supabase real.

## 1. Achados que exigem correção antes de produção

### ALTO — Migração de moderação remove todas as policies SELECT de atelie_posts
Arquivo: `supabase/moderacao-comunidade.sql`

O bloco DO consulta `pg_policies` e remove todas as policies SELECT da tabela, independentemente de finalidade, role ou condição. Depois cria uma policy pública/usuário para posts publicados e próprios.

Risco: políticas de leitura anteriores (por exemplo, regras de visibilidade por mercado, comunidade, privacidade ou estados especiais) podem ser apagadas. Isso pode abrir ou fechar acesso indevidamente.

Ação recomendada:
- Inventariar policies reais do banco antes da alteração.
- Substituir remoção ampla por migrations nomeadas, removendo somente policies antigas conhecidas.
- Criar matriz de acesso para anon, usuário autenticado, dono, artista comprador/vendedor e administrador.
- Validar leitura de posts publicados, em análise, removidos e conteúdo não listado.
**Status: pendente — não alterar sem inventário do banco.**

### ALTO — Ocultação automática por limiar fixo de denúncias
Arquivo: `supabase/moderacao-comunidade.sql`

A décima denúncia de contas diferentes muda automaticamente o post para `under_review`. A constraint unique(post_id, reporter_id) limita uma denúncia por usuário, mas não impede contas falsas/coordenadas nem mede confiabilidade.

Risco: brigading pode retirar obras do ar temporariamente e prejudicar artistas.

Ação recomendada:
- Separar denúncia recebida de decisão de ocultação.
- Usar critérios adicionais (gravidade, risco imediato, reincidência, sinais de abuso) e revisão humana.
- Rate limit por conta/IP/dispositivo no backend, sem expor dados sensíveis.
- Manter trilha de auditoria e permitir contestação.
- Em risco grave e imediato, permitir ocultação provisória por regra específica, com revisão prioritária.
**Status: pendente — política de moderação precisa de decisão de produto.**

### MÉDIO — Falta trilha de auditoria estruturada para decisões administrativas
A função `refugiart_review_post` atualiza status e envia notificação, mas não cria registro imutável dedicado com administrador, decisão anterior/nova, justificativa e referência da denúncia.

Ação recomendada: tabela de eventos de moderação append-only, escrita apenas por RPC administrativa, com ator, post, status anterior/novo, justificativa e timestamp.
**Status: pendente.**

### MÉDIO — Notificações permitem UPDATE de read_at, mas é necessário validar escopo
A policy limita a linha a `auth.uid() = user_id` e o grant de coluna limita update a `read_at`, o que é uma boa restrição. Ainda assim, testar que não há outra policy permissiva ou grant amplo herdado.
**Status: validar no banco.**

## 2. Pontos positivos observados

- A tabela `refugiart_admins` tem RLS e revoga leitura direta para anon/authenticated.
- As funções `refugiart_is_admin` e `refugiart_is_admin_user` usam SECURITY DEFINER e `search_path=public`; a lista privada de administradores não é retornada.
- A fila e a revisão administrativa verificam a identidade do administrador no banco, não apenas uma variável JavaScript.
- Denúncias são submetidas por RPC SECURITY DEFINER; leitura e escrita direta da tabela de denúncias são revogadas ao navegador.
- A tabela de notificações limita leitura à pessoa destinatária e escrita do navegador à coluna `read_at`.
- O JavaScript de moderação também verifica a permissão, mas isso é apenas UX; a autorização efetiva deve continuar no banco.

## 3. Revisão do frontend — limites importantes

- Verificação de administrador no navegador nunca substitui autorização RLS/RPC.
- Nunca incluir `service_role`, segredo de gateway, chave privada ou credencial administrativa em HTML/JS.
- URLs de imagens e campos de texto vindos do usuário devem ser tratados como não confiáveis; evitar inserir conteúdo em `innerHTML`.
- Uploads precisam validar tipo MIME, tamanho, extensão, autenticação, ownership e política de Storage.
- URLs públicas de imagens significam que a imagem é acessível a qualquer pessoa que conheça a URL; não usar bucket público para documentos pessoais.
- Perfis públicos devem expor somente campos necessários. Endereço, CPF, telefone privado e dados de pagamento não devem estar em consultas públicas.
- Para qualquer operação sensível, validar ownership no banco/RPC e não confiar em IDs ou valores enviados pelo navegador.

## 4. Checklist de validação obrigatório no Supabase

Executar somente após revisar as migrations e confirmar que o ambiente é o correto:

1. Inventariar todas as policies de tabelas públicas e buckets Storage.
2. Listar grants efetivos para anon, authenticated e service_role.
3. Confirmar que nenhuma chave service_role está nos arquivos servidos pelo site ou histórico de deploy.
4. Testar usuário A tentando ler/alterar perfil, obras, carteira, pedidos, denúncias e notificações do usuário B.
5. Testar usuário comum chamando diretamente RPCs administrativas, de liquidação, de custo, reembolso e saque.
6. Testar acesso anônimo a posts em revisão/removidos e a objetos de Storage.
7. Testar upload de arquivo inválido, muito grande e extensão/MIME divergentes.
8. Verificar logs e alertas para tentativas negadas, falhas de autenticação e abuso de denúncias.

## 5. Decisões e dependências

- Não mudar agora policies em produção sem snapshot/inventário das policies reais.
- Não habilitar moderação automática por volume sem proteção contra abuso.
- Não publicar carteira, pedidos ou dados financeiros em consultas públicas.
- Não considerar a auditoria concluída até realizar testes com usuários de papéis diferentes no Supabase real.

Este documento registra riscos e plano de validação; não executa mudanças no banco nem afirma que as permissões já foram testadas.
