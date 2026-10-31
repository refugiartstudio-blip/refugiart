# RefugiART — modelo de margem, custos e ponto de equilíbrio

Este documento define como avaliar a saúde financeira do marketplace. Os percentuais de gateway, tributos e despesas abaixo são variáveis de planejamento, não taxas contratadas nem aconselhamento contábil. Substituir por valores reais após escolher provedor, regime tributário e estrutura operacional.

## 1. Não confundir os indicadores

- **GMV / volume bruto vendido:** soma dos preços das obras efetivamente vendidas.
- **Comissão bruta:** receita contratual do RefugiART antes de custos. Venda direta: 20% do valor vendido. Leilão: 30% do valor final arrematado.
- **Margem de contribuição:** comissão menos custos variáveis da venda (gateway, tributos variáveis, subsídio de frete, reembolsos/chargebacks e outros custos variáveis).
- **Resultado operacional:** margem de contribuição menos despesas fixas e demais despesas operacionais.
- **Lucro líquido:** resultado depois de todos os custos, despesas, tributos e ajustes contábeis/fiscais. Não pode ser inferido apenas pela comissão.

## 2. Fórmulas obrigatórias

`comissao_bruta = GMV_direto × 20% + GMV_leilao × 30%`

`subsidio_ordinario_maximo = menor(frete_real, 20% × comissao_bruta)`

`margem_contribuicao = comissao_bruta - taxas_gateway - tributos_variaveis - subsidios - reembolsos - chargebacks - outros_custos_variaveis`

`resultado_operacional = margem_contribuicao - despesas_fixas - despesas_operacionais`

`margem_contribuicao_percentual = margem_contribuicao ÷ GMV × 100`

A reserva promocional extra só pode financiar benefícios depois de receber aporte real. O aporte não é faturamento nem lucro; o benefício gasto é custo.

## 3. Exemplo didático por R$ 100 vendidos

### Venda direta

- GMV: R$ 100,00
- Comissão bruta RefugiART (20%): R$ 20,00
- Teto de subsídio ordinário (20% da comissão): R$ 4,00
- Saldo da comissão após o teto máximo de subsídio: R$ 16,00, **antes** de gateway, tributos, reembolsos e operação.

### Leilão

- GMV: R$ 100,00
- Comissão bruta RefugiART (30%): R$ 30,00
- Teto de subsídio ordinário (20% da comissão): R$ 6,00
- Saldo da comissão após o teto máximo de subsídio: R$ 24,00, **antes** de gateway, tributos, reembolsos e operação.

Esses valores não são lucro. Se o frete custar menos que o teto, o subsídio efetivo será menor.

## 4. Simulação ilustrativa — R$ 3.000 de GMV direto

Hipóteses meramente ilustrativas:
- comissão: 20%;
- subsídio de frete no teto máximo: 4% do GMV (20% da comissão);
- gateway: 4% do GMV, hipótese que precisa ser substituída pela tarifa real e pelo modelo de cobrança;
- tributos: 6% da comissão, hipótese que precisa ser validada com contador;
- despesas fixas/operacionais não incluídas nesta primeira conta.

| Indicador | Valor |
|---|---:|
| GMV | R$ 3.000,00 |
| Comissão bruta (20%) | R$ 600,00 |
| Subsídio máximo ordinário (4% GMV) | -R$ 120,00 |
| Gateway hipotético (4% GMV) | -R$ 120,00 |
| Tributos hipotéticos (6% da comissão) | -R$ 36,00 |
| **Margem de contribuição antes de despesas fixas** | **R$ 324,00** |

Nesse cenário hipotético, a contribuição equivale a 10,8% do GMV e a 54% da comissão bruta. Se houver R$ 200 de despesas fixas/operacionais no período, o resultado operacional simplificado cai para R$ 124. Se custos reais forem maiores, pode ficar próximo de zero ou negativo.

## 5. Decisões para preservar caixa

1. Não oferecer frete grátis irrestrito com base apenas no carrinho de R$ 300.
2. Manter o subsídio ordinário limitado a 20% da comissão total e ao frete real.
3. Não oferecer subsídio promocional adicional sem saldo previamente financiado.
4. Não subsidiar uma venda cuja margem de contribuição estimada fique negativa, salvo campanha aprovada com orçamento específico.
5. Mostrar custo de gateway sobre a base real cobrada pelo provedor; não presumir que a taxa incide apenas sobre a comissão.
6. Reservar caixa para reembolsos, chargebacks, tributos e despesas fixas antes de distribuir lucro.
7. Rever preços, taxas e campanhas quando a margem de contribuição cair abaixo do mínimo definido pela administração.
8. Medir margem por venda, por checkout, por modalidade (direta/leilão), por mês e por canal de pagamento.
9. Separar dinheiro do artista, dinheiro da plataforma e reservas promocionais; não usar saldo de terceiros como capital de giro.
10. Não chamar saldo da carteira, comissão bruta ou reserva promocional de lucro.

## 6. Ponto de equilíbrio

O ponto de equilíbrio mensal deve ser calculado com a contribuição média real por real vendido:

`GMV_de_equilibrio = despesas_fixas_mensais ÷ margem_de_contribuicao_percentual`

Exemplo: se despesas fixas mensais forem R$ 1.000 e a margem de contribuição observada for 10%, o GMV aproximado de equilíbrio será R$ 10.000. É uma simulação matemática, não uma previsão de vendas.

## 7. O que o painel financeiro deve exibir

- GMV por modalidade;
- comissão bruta por modalidade;
- taxas de gateway por provedor e método;
- tributos provisionados e efetivamente pagos;
- subsídios ordinários e promocionais;
- reembolsos e chargebacks;
- despesas fixas e variáveis;
- saldo financiado e disponível da reserva promocional;
- margem de contribuição em reais e percentual;
- resultado operacional estimado;
- conciliação entre pedidos, carteira, ledger da plataforma e extratos do provedor.

O relatório mensal da migration 009 é uma primeira base técnica. Até que todos os custos sejam integrados e conciliados, seu resultado é apenas contribuição sobre lançamentos registrados — não lucro líquido.
