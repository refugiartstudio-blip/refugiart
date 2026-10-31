# Política de frete e incentivo de ticket médio — RefugiART

## Regras comerciais aprovadas

- Venda direta: comissão bruta de 20% sobre o preço efetivamente vendido.
- Leilão: comissão bruta de 30% sobre o valor final arrematado.
- O artista não paga o subsídio de frete. O subsídio sai da parcela do RefugiART.
- O teto ordinário de subsídio é 20% da comissão total gerada no checkout.
- Subsídio nunca supera o frete real cotado.
- Se o frete total for menor ou igual ao limite de subsídio, o comprador recebe frete grátis.
- Se o frete ultrapassar o limite, o RefugiART subsidia até o limite e o comprador paga o restante.
- Campanha de incentivo: carrinhos a partir de R$ 300 ficam elegíveis à campanha de frete grátis, mas a gratuidade continua condicionada ao limite financeiro de subsídio. Abaixo de R$ 300, continua existindo o subsídio automático ordinário.

## Fórmula

pool_de_subsidio = 20% × soma das comissões das obras no checkout

subsidio_total = menor entre frete_total e pool_de_subsidio

frete_do_comprador = frete_total - subsidio_total

## Vários artistas / vários fretes

A sacola pode conter obras de vários artistas. Cada artista pode enviar de uma origem diferente, portanto cada origem/seller gera uma cotação e uma remessa/pedido próprio. O checkout consolida a experiência e mostra ao comprador:

- subtotal de todas as obras;
- cada envio identificado por artista (ou pacote), com seu frete cotado;
- subsídio RefugiART por pacote;
- total de frete pago pelo comprador;
- total final do checkout.

O limite de subsídio é calculado uma única vez sobre a soma das comissões de todas as obras do checkout, e não separadamente como se cada pacote tivesse um orçamento independente. O subsídio total é distribuído proporcionalmente ao frete de cada pacote. O backend deve ajustar centavos residuais no último pacote para que a soma alocada seja exatamente igual ao subsídio total, sem ultrapassar o frete de nenhum pacote.

## Exemplo: três artistas

Carrinho de R$ 400 com comissão total de R$ 80 (hipótese de venda direta), fretes de R$ 30, R$ 50 e R$ 70:

- Frete total: R$ 150.
- Pool máximo: R$ 16.
- Subsídio total: R$ 16.
- Comprador paga: R$ 134.
- Alocação proporcional aproximada: R$ 3,20; R$ 5,33; R$ 7,47.

Como o carrinho ultrapassa R$ 300, fica marcado como elegível à campanha. A campanha não aumenta automaticamente o teto de subsídio.

## Cuidados de implementação

- O CEP é do comprador; a cotação deve usar CEP de origem cadastrado pelo artista, peso e dimensões embaladas de cada obra, além do serviço/carrier escolhido.
- Não somar fretes presumidos nem inventar valores. Sem cotação real, mostrar "calcular frete" e não confirmar checkout.
- Uma obra por artista pode compartilhar pacote somente se o serviço de frete e a origem permitirem; por segurança, o padrão inicial é uma remessa por artista.
- Para vários artistas, criar pedidos/remessas separados ligados por checkout_group_id, mas cobrar o comprador em uma única sessão de pagamento quando o provedor permitir split/marketplace. Se o provedor não suportar isso, o checkout deve informar a limitação antes do pagamento.
- O cálculo e os snapshots de comissão/frete/subsídio devem ser feitos e gravados no backend confiável; nunca confiar em valores enviados pelo navegador.
- A campanha de R$ 300 é uma regra comercial configurável, não promessa de frete grátis irrestrito.
- As taxas do provedor, tributos e custos operacionais ainda precisam ser descontados na análise de margem; não aumentam o pool de frete.
- Não ativar cobrança ou frete até integrar cotador e provedor de pagamento e testar a liquidação.
