# RefugiART — roteiro de validação financeira

Este roteiro é para ambiente de desenvolvimento/homologação. Não usar dinheiro real.

## Ordem das migrações

1. `moderação-comunidade.sql` (reaplicar a versão corrigida, após revisar políticas existentes).
2. `migrations/20261030_auction_balloon_system.sql`.
3. `migrations/20261030_003_orders_shipping_disputes.sql`.
4. `migrations/20261030_004_auction_reservations.sql`.
5. `migrations/20261030_005_auction_settlement_safety.sql`.
6. `migrations/20261030_006_shipping_subsidy_policy.sql`.
7. `migrations/20261030_008_prevent_early_delivery_confirmation.sql`.
8. `agendar-encerramento-leiloes.sql` somente depois de validar a função e confirmar que pg_cron está habilitado.

A ordem deve ser confirmada contra o estado real do projeto antes de executar. Os arquivos não foram executados neste repositório remoto.

## Pré-condições

- Criar usuários de teste distintos: artista, participante A, participante B e usuário sem saldo.
- Confirmar que cada usuário possui carteira.
- Creditar saldo exclusivamente por procedimento administrativo de teste, nunca por update no navegador.
- Criar uma obra publicada e um leilão de teste com preço inicial conhecido.
- Verificar políticas RLS, grants, triggers e tipos de colunas existentes.
- Não habilitar checkout, Pix, saque ou lances em produção antes dos testes.

## Cenários de lance

1. Participante A oferta o lance mínimo: saldo disponível diminui e reservado aumenta pelo mesmo valor.
2. A aumenta o próprio lance: somente a diferença adicional é reservada.
3. Participante B supera A: reserva de A retorna ao disponível; B fica reservado.
4. A volta a ofertar: uma nova reserva é criada/reativada sem duplicar a reserva anterior.
5. Participante sem saldo tenta ofertar: operação falha sem criar lance ou movimentação.
6. Artista tenta ofertar na própria obra: operação falha.
7. Lance no instante/apos o encerramento: operação falha com base no relógio do banco.
8. Duas ofertas concorrentes: nenhuma carteira fica negativa e somente uma sequência válida é registrada.
9. Reexecutar encerramento: nenhum pedido, captura ou crédito duplicado.
10. Leilão sem lance: encerra sem vencedor e sem movimentação financeira.

## Cenários de encerramento com vencedor

- A reserva do vencedor é capturada uma única vez.
- O saldo reservado do vencedor diminui.
- O valor do artista entra como pendente, não disponível.
- As reservas dos demais participantes são liberadas.
- É criado um pedido único vinculado ao leilão.
- O pedido fica em `awaiting_shipment`, com pagamento interno registrado e prazo de três dias úteis.
- É criada uma remessa em `awaiting_post`.
- O frete fica explicitamente `pending_quote`; o valor do lance não deve ser apresentado como frete grátis.
- O item preserva o título/legenda e o preço do momento da venda.
- Qualquer inconsistência deve abortar toda a transação, sem liquidar parcialmente.

## Limitações ainda abertas

- Não há integração com provedor de pagamento externo.
- O checkout da sacola não cria pedidos nem recebe pagamentos.
- O prazo de três dias úteis depende do calendário de feriados preenchido e revisado.
- Ainda não existe verificação oficial automática de rastreamento/postagem.
- Ainda não existe processo de reembolso via provedor nem tratamento completo de chargeback.
- O cron job precisa ser instalado e monitorado.
- A função de lance ainda não deve ser ligada à interface pública antes da revisão técnica e dos testes de concorrência, RLS e saldos.


## Cenários da política de frete (migration 006)

- Venda direta: comissão registrada em 20% do preço efetivamente vendido.
- Leilão: comissão registrada em 30% do valor final arrematado.
- O orçamento de subsídio é 20% da soma das comissões do checkout.
- O subsídio total nunca supera o frete total cotado.
- Se o frete total for menor que o orçamento, o comprador recebe frete grátis.
- Se o frete total superar o orçamento, o comprador paga a diferença.
- A campanha de R$ 300 considera o subtotal de todas as obras do carrinho; a elegibilidade não aumenta o teto financeiro de subsídio.
- Carrinho com três artistas deve gerar três cotações/remessas separadas, mas um grupo de checkout consolidado.
- O subsídio deve ser distribuído proporcionalmente entre os fretes dos pacotes; o backend ajusta centavos residuais para a soma fechar exatamente.
- CEP de destino, CEP de origem, peso e dimensões precisam ser usados na cotação real. Sem cotação, não confirmar valor nem pagamento.
- Rejeitar qualquer tentativa do navegador de definir comissão, frete cotado ou subsídio; todos os valores devem ser recalculados e gravados pelo backend confiável.
- Conferir que a soma de shipping_amount dos pedidos seja igual ao frete pago pelo comprador e que cada pedido respeite total_amount = subtotal + shipping_amount.


## Confirmacao de entrega e liberacao do artista (migration 007)

- Pedido novo de venda direta recebe snapshot de comissao de 20%; pedido de leilao recebe 30% sobre o valor final arrematado.
- O valor bruto da venda permanece em saldo pendente ate confirmacao valida de entrega.
- Entrega por transportadora: codigo de rastreio sozinho nao libera dinheiro. A liberacao exige confirmacao do comprador ou revisao administrativa baseada em evidencia confiavel.
- Entrega pessoal/retirada: comprador emite codigo aleatorio de uso unico, valido por 48 horas; o banco armazena somente hash. Artista informa o codigo recebido presencialmente. Codigo errado incrementa tentativas; apos 10, novo codigo deve ser emitido pelo comprador.
- O comprador tambem pode confirmar recebimento diretamente na conta, inclusive em envio/retirada.
- Confirmacao de entrega nao libera pedido com disputa aberta.
- A liberacao e idempotente: pedido liberado nao pode ser pago novamente.
- Antes de liberar, backend exige credito pendente de venda vinculado ao pedido e confere valor bruto com subtotal.
- Na liquidacao, saldo pendente bruto e substituido por saldo disponivel liquido; comissao e registrada como debito do artista e receita no livro-razao da plataforma.
- Venda direta: artista recebe 80% do subtotal; RefugiART registra 20%. Leilao: artista recebe 70% do valor final; RefugiART registra 30%. Frete e subsidio permanecem contabilizados separadamente.
- Disputa aberta suspende liberacao ate revisao. Nunca liberar somente porque o artista digitou um rastreio.
- Testar concorrencia (duas confirmacoes simultaneas), codigo expirado, codigo incorreto, 10 tentativas, codigo reutilizado, disputa antes da confirmacao, saldo pendente divergente, pedido duplicado e reexecucao da liberacao.
- A migration cria estrutura/RPCs, mas nao integra rastreamento automatico, gateway, saque Pix nem painel administrativo. Nao ativar dinheiro real antes de testes no Supabase e revisao de RLS/permissoes.


## Migration 008 — bloqueio de confirmacao antecipada

- Pedido com entrega por transportadora em `paid` ou `awaiting_shipment`: confirmacao do comprador deve falhar e nao liberar saldo.
- Pedido por transportadora em `shipped`: comprador pode confirmar recebimento explicitamente; a liquidacao continua bloqueada se houver disputa ou credito pendente divergente.
- Pedido por entrega pessoal/retirada: fluxo de codigo de uso unico continua disponivel.
- Testar tambem pedido inexistente, comprador diferente, pedido cancelado, disputa aberta e confirmacao repetida.


## Migration 009 — testes de saúde financeira

1. Lançar despesas de gateway, tributos, subsídio de frete, reembolso, chargeback e operação; conferir categorias e total mensal.
2. Confirmar que uma comissão aparece uma única vez no relatório, a partir de `refugiart_platform_ledger`.
3. Aportar R$ 100,00 na reserva promocional e conferir saldo R$ 100,00; tentar gastar R$ 100,01 e confirmar rejeição; gastar R$ 40,00 e conferir saldo R$ 60,00.
4. Repetir uma chamada com a mesma chave idempotente e confirmar que não cria lançamento duplicado.
5. Executar dois gastos promocionais concorrentes e confirmar que a soma nunca ultrapassa a reserva disponível.
6. Confirmar que aportes promocionais não entram como receita nem como lucro; somente o gasto promocional entra nos custos.
7. Conferir que o resultado mensal é identificado como resultado de contribuição antes de custos não registrados, e não como lucro líquido.
8. Testar usuário anon, authenticated e service_role: somente service_role pode consultar a visão gerencial ou lançar custos.
9. Conciliar comissão, despesas e saldos com pedidos e extratos de pagamento em ambiente de homologação.


## Migration 010 — rateio de centavos do frete

1. Um pacote: subsídio igual ao limite global ou ao frete, o que for menor.
2. Três pacotes com fretes R$ 30,00, R$ 50,00 e R$ 70,00; comissão total R$ 80,00: subsídio total R$ 16,00 e soma das parcelas deve ser exatamente R$ 16,00.
3. Frete total inferior ao teto: subsídio não pode superar o frete real.
4. Frete zero: subsídio e frete do comprador devem ser zero.
5. Carrinho abaixo/acima de R$ 300: elegibilidade deve refletir o subtotal, sem alterar o teto financeiro.
6. Pacotes com identificador repetido, campo ausente, frete negativo ou formato inválido devem ser rejeitados.
7. Conferir que nenhum pacote recebe subsídio maior que seu frete e que a soma do frete pago pelo comprador + subsídio é igual ao frete cotado total.


## Encerramento sem vencedor — migration 012

14. Encerrar leilao sem lances: deve finalizar sem criar pedido ou debito e sem alterar carteiras.
15. Encerrar leilao com reservas ativas, mas sem vencedor valido: devolver cada reserva ao saldo disponivel e registrar uma transacao por participante.
16. Repetir a rotina depois de encerrado: nenhuma carteira pode receber devolucao duplicada.
17. Simular reserva maior que o saldo reservado na carteira: a operacao deve falhar integralmente, sem encerrar o leilao nem liberar parcialmente outros participantes.
