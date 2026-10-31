# RefugiART — auditoria do checkout e da entrada de pagamentos

Data da revisão: 31/10/2026  
Escopo: leitura estática do frontend publicado e das migrations de pedidos/pagamentos disponíveis no branch `main`. Nenhuma cobrança foi criada e nenhum SQL foi executado.

## Resultado

**O checkout financeiro ainda não está implementado.** A experiência atual permite montar uma sacola no navegador, mas não cria pedido, não reserva a obra, não inicia cobrança e não recebe confirmação de pagamento. O botão de finalização informa que a integração ainda será feita.

Isso é preferível a simular uma compra ou exibir um pagamento sem cobertura no servidor. A sacola pode continuar funcionando como lista de interesse, desde que não prometa uma compra concluída.

## Evidências encontradas

### 1. Sacola (`sacola.html`)

- Os itens são lidos e gravados em `localStorage` na chave `refugiart_sacola`.
- Preço, título, imagem, artista e IDs são exibidos a partir do conteúdo local.
- O total é somado no navegador.
- O botão `Finalizar compra` apenas mostra um alerta; não chama RPC, API ou provedor.
- O próprio texto da página informa que checkout e pagamento dependem da integração financeira.

**Conclusão:** preço e total exibidos são apenas informativos. Podem ser alterados pelo comprador no navegador e nunca devem ser aceitos pelo backend como valores de cobrança.

### 2. Bazar (`bazar.html`)

- O frontend consulta `atelie_posts` diretamente com a chave pública do Supabase.
- Os anúncios são filtrados por publicação no mercado e moderação publicada.
- O botão de compra adiciona ao armazenamento local `id`, `user_id`, imagem, título, artista e preço.
- Não há reserva transacional da obra no momento de adicionar à sacola.

**Conclusão:** a consulta pública depende de RLS correta. A sacola não garante disponibilidade; entre adicionar e tentar comprar, a obra pode ser removida, alterada ou adquirida por outra pessoa.

### 3. Estrutura de pedidos (`20261030_003_orders_shipping_disputes.sql`)

- Há estrutura de pedidos, itens, remessas e disputas.
- O pedido contempla `payment_provider`, `provider_payment_id` único e `paid_at`.
- As tabelas restringem escrita a `service_role` e leitura aos envolvidos.
- A migration declara que cria estrutura e não ativa checkout nem confirma pagamentos.

**Conclusão:** campos de referência externa não equivalem a integração. Não foi encontrada nessa estrutura uma RPC/API completa que crie pedido e cobrança de forma transacional.

### 4. Entrada, confirmação e conciliação

Na leitura dos arquivos do repositório não foi localizado fluxo implementado de:
- criação de cobrança Pix/cartão no servidor;
- validação de assinatura de webhook;
- registro idempotente dos eventos do provedor;
- consulta de status diretamente no provedor para resolver eventos ambíguos;
- conciliação de valor bruto, taxa, valor líquido, reembolso e chargeback;
- tratamento de pagamento aprovado após expiração/cancelamento do pedido;
- confirmação de pagamento sem depender de retorno do navegador.

O diagnóstico SQL já existente é somente leitura e alerta para inconsistências internas. Ele não substitui extrato/API do provedor.

## Riscos e decisões obrigatórias

### P0 — antes de cobrar qualquer comprador

1. **Backend como autoridade:** o navegador envia somente IDs das obras e quantidades. O servidor valida autenticação, propriedade, publicação, modalidade, disponibilidade e preço atual no banco.
2. **Reserva de obra única:** criar pedido e reservar/retirar a disponibilidade de forma atômica, impedindo duas compras concorrentes da mesma obra.
3. **Snapshot imutável:** persistir preço, título, vendedor, comissão, frete, subsídio e total calculados no servidor. Alterações posteriores no anúncio não modificam o pedido.
4. **Cobrança vinculada:** criar cobrança no provedor com referência interna única e metadados mínimos; nunca confiar em valor, vendedor ou status enviados pelo cliente.
5. **Webhook autenticado:** validar assinatura conforme documentação oficial do provedor, validar valor/moeda/referência, persistir evento e processar com idempotência.
6. **Estado financeiro explícito:** distinguir pedido criado, cobrança pendente, pagamento confirmado, expirado, cancelado, reembolsado e em disputa. Retorno à página não confirma pagamento.
7. **Eventos fora de ordem:** tratar webhook repetido, atrasado ou conflitante; consultar o provedor quando houver ambiguidade.
8. **Conciliação:** comparar pedido, cobrança, recebimento bruto, taxas, líquido, reembolsos e extrato do provedor. Não liberar saldo do artista só porque o frontend mostrou sucesso.

### P1 — arquitetura de marketplace

- Definir se o provedor fará split entre plataforma e artistas ou se haverá recebimento centralizado com repasse posterior.
- Confirmar formalmente que o provedor aceita marketplace, vendedores terceiros, KYC e repasses Pix.
- Mapear taxas, prazos de liquidação, reservas, chargebacks, reembolsos parciais e responsabilidades.
- Para carrinho com vários artistas, decidir se o provedor suporta uma cobrança com divisão ou se o backend criará cobranças/pedidos coordenados. Não presumir split.
- Não criar pedidos separados sem uma entidade de checkout/grupo que permita reconciliar o pagamento único e falhas parciais.

## Fluxo recomendado

1. Cliente autenticado envia ao backend apenas IDs e quantidades.
2. Backend bloqueia/valida as obras e recalcula todos os valores com dados do banco.
3. Backend cria checkout_group e pedidos vinculados, com snapshots financeiros e expiração.
4. Backend solicita a cobrança ao provedor usando chave idempotente.
5. Provedor envia webhook; backend valida assinatura, valor, moeda, referência e estado.
6. Backend registra evento externo uma única vez e confirma o pagamento transacionalmente.
7. Só então o pedido muda para pago e o saldo líquido do artista fica pendente, nunca disponível antes da entrega.
8. Rotina de conciliação compara os registros internos com a API/extrato do provedor.
9. Reembolsos e chargebacks abrem casos financeiros e bloqueiam repasse conforme a política já documentada.

## Dependências externas ainda não decididas

- Provedor de pagamentos compatível com marketplace e Pix.
- Modelo de split/liquidação e titularidade da conta recebedora.
- KYC dos artistas e regras de saque.
- Política de prazo/expiração de cobrança e reserva de obra.
- Serviço de frete e sua integração com checkout.

Não escolher ou codificar um provedor por suposição. A seleção precisa considerar tarifas reais, disponibilidade no Brasil, suporte a marketplace, split, webhooks assinados, reembolsos e Pix.

## Critério de liberação

Checkout só poderá ser habilitado depois de: backend transacional implementado; provedor escolhido e homologado; webhooks assinados e idempotentes; testes de concorrência, repetição, atraso e falha; conciliação de valores; RLS/grants conferidos; e teste ponta a ponta em ambiente de homologação.

**Status:** auditoria estática concluída e documentada. Checkout, cobranças, webhooks e conciliação automática permanecem não implementados. Nenhuma migration foi executada no Supabase.
