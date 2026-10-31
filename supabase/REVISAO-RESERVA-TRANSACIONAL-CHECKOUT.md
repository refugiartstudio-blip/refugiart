# RefugiART — reserva transacional inicial de obras no checkout

Data: 31/10/2026  
Arquivo: `migrations/20261031_014_checkout_item_reservations.sql`  
Estado: código criado no GitHub; **não executado no Supabase e não homologado em PostgreSQL**.

## O que esta etapa implementa em código

A migration cria:
- `refugiart_checkout_groups`: grupo do checkout por comprador, com chave de idempotência, subtotal de itens e prazo de expiração.
- `refugiart_checkout_reservations`: reserva por obra, com comprador, vendedor, título e preço copiados do banco.
- Índice único parcial que impede a mesma obra de ficar reservada em mais de um checkout ou consumida por mais de uma venda.
- RLS para o comprador consultar o grupo e comprador/vendedor consultarem a reserva; escritas diretas dos clientes são revogadas.
- RPC `refugiart_reserve_market_items(bigint[], uuid)`, executável por usuário autenticado.

## Como a RPC funciona

1. Exige sessão autenticada e chave UUID de idempotência.
2. Aceita de 1 a 20 IDs de obras, sem repetição.
3. Serializa repetição da mesma chave com advisory lock transacional.
4. Expira reservas vencidas antes de tentar reservar novamente.
5. Bloqueia as linhas de `atelie_posts` em ordem crescente de ID.
6. Confere que cada obra existe, pertence a outro usuário, está publicada, está no mercado, tem preço positivo e não está reservada/consumida.
7. Calcula o subtotal a partir de `atelie_posts.preco`; não recebe preço do navegador.
8. Cria grupo e snapshots de cada item com validade inicial de 15 minutos.
9. Repetições da mesma requisição retornam o grupo original, sem duplicar reservas.

## Limites deliberados

Esta etapa **não**:
- cria pedido em `refugiart_orders`;
- cota frete, calcula subsídio ou comissão;
- cria Pix/cartão ou chama provedor;
- confirma pagamento;
- credita carteira;
- marca a obra como vendida;
- libera reserva por cancelamento administrativo;
- implementa rotina agendada para expirar reservas sem novo checkout.

A RPC só inicia a reserva de itens para posterior cotação. O estado `reserved_for_quote` não significa compra paga.

## Pendências antes de executar a migration

- Validar a ordem e a existência de todas as migrations-base no Supabase.
- Confirmar tipos reais de `atelie_posts.id`, `preco`, `user_id`, `caption` e os campos de anúncio.
- Executar em ambiente de homologação e testar sintaxe, RLS, grants e função SECURITY DEFINER.
- Testar duas sessões comprando a mesma obra simultaneamente: apenas uma pode reservar.
- Testar chave de idempotência repetida e concorrente.
- Testar 20 itens, IDs repetidos, IDs inexistentes, obra própria, anúncio removido, preço nulo/zero e obra em leilão.
- Testar expiração e tentativa de reserva após 15 minutos.
- Definir a política de cancelamento e a rotina agendada de limpeza.
- Definir a transição atômica de `reserved` para `consumed` após confirmação autenticada do pagamento; nunca no retorno do navegador.
- Bloquear exclusão física de obras com histórico de reserva e preferir arquivamento lógico.

## Próxima implementação

A próxima etapa é a transição segura do grupo reservado para pedidos por vendedor, incluindo:
- um pedido por artista dentro do mesmo `checkout_group_id`;
- snapshots de comissão de 20% na venda direta;
- cotação real de frete por pacote;
- subsídio total limitado a 20% da comissão e rateio exato já documentado;
- soma consolidada e consistência entre grupo, pedidos, itens e remessas.

Só depois dessa etapa será criada a camada de cobrança, condicionada à escolha do provedor.

**Aviso:** a migration está versionada no GitHub, mas não foi executada nem testada contra o banco real. Não habilitar checkout na interface.
