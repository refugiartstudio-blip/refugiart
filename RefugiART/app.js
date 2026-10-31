
// Mock localStorage para ambientes que não suportam (navegador normal ignora isso)
if (typeof localStorage === 'undefined' || localStorage === null) {
    let mockStorage = {};
    window.localStorage = {
        getItem(key) {
            return mockStorage[key] || null;
        },
        setItem(key, value) {
            mockStorage[key] = value;
        },
        removeItem(key) {
            delete mockStorage[key];
        },
        clear() {
            mockStorage = {};
        }
    };
}

// Estado auxiliar para Venda / Saída Rápida (em centavos)
let quickSaleCents = 0;
let quickExitCents = 0;

// Initialize data
let inventory = JSON.parse(localStorage.getItem('inventory')) || [
    { id: 1, name: 'Produto A', quantity: 50, price: 25.90 },
    { id: 2, name: 'Produto B', quantity: 30, price: 45.50 },
    { id: 3, name: 'Produto C', quantity: 20, price: 89.90 }
];

let clients = JSON.parse(localStorage.getItem('clients')) || [
    { id: 1, name: 'João Silva', email: 'joao@email.com', phone: '(11) 99999-8888' },
    { id: 2, name: 'Maria Santos', email: 'maria@email.com', phone: '(21) 88888-7777' }
];

let quotes = JSON.parse(localStorage.getItem('quotes')) || [];
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let currentQuoteItems = [];
let quoteCounter = JSON.parse(localStorage.getItem('quoteCounter')) || 1;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    showSection(null, 'dashboard');
    loadClientsToSelect();
    loadProductsToSelect();
    updateInventoryTable();
    updateClientsTable();
    updateQuotesTable();
    updateCashier();
    updateSummary();
    initChart();
    initCashierChart();
});

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} ${type === 'success' ? 'success' : 'error'}`;
    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

// Show section
function showSection(evt, sectionId) {
    // Hide all sections
    document.querySelectorAll('.dashboard').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.remove('hidden');
    
    // Update active nav link
    document.querySelectorAll('nav a').forEach(link => {
        link.classList.remove('active');
    });
    if (evt && evt.target) {
        evt.target.classList.add('active');
    }
    
    // Update data when showing dashboard
    if (sectionId === 'dashboard') {
        updateSummary();
        updateChart();
    }
    
    // Update cashier chart when showing cashier
    if (sectionId === 'cashier') {
        updateCashierChart();
    }

    // Carrega produtos ao entrar em Orçamentos
    if (sectionId === 'quotes') {
        loadProductsToSelect();
    }
}

// Add product to inventory
function addProduct() {
    const name = document.getElementById('product-name').value;
    const quantity = parseInt(document.getElementById('product-quantity').value);
    const price = parseFloat(document.getElementById('product-price').value);
    
    if (!name || isNaN(quantity) || isNaN(price)) {
        showNotification('Preencha todos os campos corretamente', 'error');
        return;
    }
    
    const productId = inventory.length > 0 ? Math.max(...inventory.map(p => p.id)) + 1 : 1;
    inventory.push({
        id: productId,
        name: name,
        quantity: quantity,
        price: price
    });
    
    localStorage.setItem('inventory', JSON.stringify(inventory));
    updateInventoryTable();
    loadProductsToSelect();
    showNotification('Produto adicionado com sucesso!');
    
    // Clear form
    document.getElementById('product-name').value = '';
    document.getElementById('product-quantity').value = '';
    document.getElementById('product-price').value = '';
}

// Update inventory table
function updateInventoryTable() {
    const tbody = document.getElementById('inventory-body');
    tbody.innerHTML = '';
    
    inventory.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.quantity}</td>
            <td>R$ ${product.price.toFixed(2)}</td>
            <td>R$ ${(product.quantity * product.price).toFixed(2)}</td>
            <td>
                <button class="btn-warning" onclick="editProduct(${product.id})">Editar</button>
                <button class="btn-danger" onclick="deleteProduct(${product.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Edit product
function editProduct(id) {
    const product = inventory.find(p => p.id === id);
    if (!product) return;

    const newName = prompt('Nome do produto:', product.name);
    if (!newName) return;

    const newQuantityStr = prompt('Quantidade em estoque:', product.quantity);
    const newPriceStr = prompt('Preço unitário (R$):', product.price.toFixed(2));

    const newQuantity = parseInt(newQuantityStr);
    const newPrice = parseFloat(newPriceStr.replace(',', '.'));

    if (isNaN(newQuantity) || isNaN(newPrice)) {
        showNotification('Valores inválidos ao editar produto', 'error');
        return;
    }

    product.name = newName;
    product.quantity = newQuantity;
    product.price = newPrice;

    localStorage.setItem('inventory', JSON.stringify(inventory));
    updateInventoryTable();
    loadProductsToSelect();
    showNotification('Produto atualizado com sucesso!');
}

// Delete product
function deleteProduct(id) {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
        inventory = inventory.filter(product => product.id !== id);
        localStorage.setItem('inventory', JSON.stringify(inventory));
        updateInventoryTable();
        loadProductsToSelect();
        showNotification('Produto excluído com sucesso!');
    }
}

// Add client
function addClient() {
    const name = document.getElementById('client-name').value;
    const email = document.getElementById('client-email').value;
    const phone = document.getElementById('client-phone').value;
    
    if (!name || !email) {
        showNotification('Preencha pelo menos nome e email', 'error');
        return;
    }
    
    const clientId = clients.length > 0 ? Math.max(...clients.map(c => c.id)) + 1 : 1;
    clients.push({
        id: clientId,
        name: name,
        email: email,
        phone: phone
    });
    
    localStorage.setItem('clients', JSON.stringify(clients));
    updateClientsTable();
    loadClientsToSelect();
    showNotification('Cliente cadastrado com sucesso!');
    
    // Clear form
    document.getElementById('client-name').value = '';
    document.getElementById('client-email').value = '';
    document.getElementById('client-phone').value = '';
}

// Update clients table
function updateClientsTable() {
    const tbody = document.getElementById('clients-body');
    tbody.innerHTML = '';
    
    clients.forEach(client => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${client.name}</td>
            <td>${client.email}</td>
            <td>${client.phone}</td>
            <td>
                <button class="btn-warning" onclick="editClient(${client.id})">Editar</button>
                <button class="btn-danger" onclick="deleteClient(${client.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Edit client
function editClient(id) {
    const client = clients.find(c => c.id === id);
    if (!client) return;

    const newName = prompt('Nome do cliente:', client.name);
    if (!newName) return;

    const newEmail = prompt('Email do cliente:', client.email);
    const newPhone = prompt('Telefone do cliente:', client.phone || '');

    if (!newEmail) {
        showNotification('Email não pode ficar vazio', 'error');
        return;
    }

    client.name = newName;
    client.email = newEmail;
    client.phone = newPhone;

    localStorage.setItem('clients', JSON.stringify(clients));
    updateClientsTable();
    loadClientsToSelect();
    showNotification('Cliente atualizado com sucesso!');
}

// Delete client
function deleteClient(id) {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
        clients = clients.filter(client => client.id !== id);
        localStorage.setItem('clients', JSON.stringify(clients));
        updateClientsTable();
        loadClientsToSelect();
        showNotification('Cliente excluído com sucesso!');
    }
}

// Load clients to select dropdown
function loadClientsToSelect() {
    const select = document.getElementById('quote-client');
    select.innerHTML = '<option value="">Selecione um cliente</option>';
    
    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        select.appendChild(option);
    });
}

// Load products to select dropdown
function loadProductsToSelect() {
    const select = document.getElementById('quote-product');
    select.innerHTML = '<option value="">Selecione um produto</option>';
    
    inventory.forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.name} - R$ ${product.price.toFixed(2)}`;
        option.dataset.price = product.price;
        option.dataset.quantity = product.quantity;
        select.appendChild(option);
    });
}

// Add item to quote
function addItemToQuote() {
    const productId = parseInt(document.getElementById('quote-product').value);
    const quantity = parseInt(document.getElementById('quote-quantity').value);
    
    if (!productId || isNaN(quantity) || quantity <= 0) {
        showNotification('Selecione um produto e quantidade válida', 'error');
        return;
    }
    
    const product = inventory.find(p => p.id === productId);
    if (!product) return;
    
    if (quantity > product.quantity) {
        showNotification('Quantidade indisponível em estoque', 'error');
        return;
    }
    
    currentQuoteItems.push({
        id: product.id,
        name: product.name,
        quantity: quantity,
        price: product.price,
        total: quantity * product.price
    });
    
    updateQuoteItemsList();
    document.getElementById('quote-quantity').value = '1';
}

// Update quote items list
function updateQuoteItemsList() {
    const list = document.getElementById('quote-items-list');
    list.innerHTML = '';
    
    if (currentQuoteItems.length === 0) {
        list.innerHTML = '<p>Nenhum item adicionado ao orçamento.</p>';
        return;
    }
    
    let total = 0;
    currentQuoteItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.marginBottom = '10px';
        div.innerHTML = `
            <span>${item.name} - ${item.quantity} x R$ ${item.price.toFixed(2)} = R$ ${item.total.toFixed(2)}</span>
            <button class="btn-danger" style="margin-left: 10px; padding: 5px 10px;" onclick="removeQuoteItem(${index})">Remover</button>
        `;
        list.appendChild(div);
        total += item.total;
    });
    
    const totalDiv = document.createElement('div');
    totalDiv.style.fontWeight = 'bold';
    totalDiv.style.marginTop = '10px';
    totalDiv.innerHTML = `Total: R$ ${total.toFixed(2)}`;
    list.appendChild(totalDiv);
}

// Remove item from quote
function removeQuoteItem(index) {
    currentQuoteItems.splice(index, 1);
    updateQuoteItemsList();
}

// Generate quote
function generateQuote() {
    const clientId = parseInt(document.getElementById('quote-client').value);
    
    if (!clientId) {
        showNotification('Selecione um cliente', 'error');
        return;
    }
    
    if (currentQuoteItems.length === 0) {
        showNotification('Adicione pelo menos um item ao orçamento', 'error');
        return;
    }
    
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    
    const quote = {
        id: quoteCounter++,
        clientId: clientId,
        clientName: client.name,
        items: [...currentQuoteItems],
        total: currentQuoteItems.reduce((sum, item) => sum + item.total, 0),
        status: 'Pendente',
        date: new Date().toISOString().split('T')[0]
    };
    
    quotes.push(quote);
    localStorage.setItem('quotes', JSON.stringify(quotes));
    localStorage.setItem('quoteCounter', quoteCounter);
    
    // Clear current quote
    currentQuoteItems = [];
    document.getElementById('quote-client').selectedIndex = 0;
    updateQuoteItemsList();
    updateQuotesTable();
    
    showNotification('Orçamento gerado com sucesso!');
}

// Update quotes table
function updateQuotesTable() {
    const tbody = document.getElementById('quotes-body');
    tbody.innerHTML = '';
    
    quotes.forEach(quote => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>#${quote.id}</td>
            <td>${quote.clientName}</td>
            <td>${quote.date}</td>
            <td>R$ ${quote.total.toFixed(2)}</td>
            <td>${quote.status}</td>
            <td>
                <button class="btn-success" onclick="confirmQuote(${quote.id})">Confirmar</button>
                <button onclick="generatePDF(${quote.id})">PDF</button>
                <button class="btn-danger" onclick="deleteQuote(${quote.id})">Excluir</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Confirm quote (convert to order)
function confirmQuote(quoteId) {
    const quoteIndex = quotes.findIndex(q => q.id === quoteId);
    if (quoteIndex === -1) return;
    
    const quote = quotes[quoteIndex];
    
    // Update inventory
    let sufficientStock = true;
    quote.items.forEach(item => {
        const product = inventory.find(p => p.id === item.id);
        if (product && product.quantity >= item.quantity) {
            product.quantity -= item.quantity;
        } else {
            sufficientStock = false;
        }
    });
    
    if (!sufficientStock) {
        showNotification('Estoque insuficiente para confirmar o pedido', 'error');
        return;
    }
    
    // Update quote status
    quote.status = 'Confirmado';
    
    // Add transaction to cashier
    transactions.push({
        id: transactions.length + 1,
        type: 'entrada',
        amount: quote.total,
        description: `Pedido #${quote.id} - ${quote.clientName}`,
        date: new Date().toISOString().split('T')[0]
    });
    
    localStorage.setItem('inventory', JSON.stringify(inventory));
    localStorage.setItem('quotes', JSON.stringify(quotes));
    localStorage.setItem('transactions', JSON.stringify(transactions));
    
    updateInventoryTable();
    updateQuotesTable();
    updateCashier();
    updateSummary();
    updateChart();
    updateCashierChart();
    
    showNotification('Pedido confirmado e estoque atualizado!');
}

// Delete quote
function deleteQuote(quoteId) {
    if (confirm('Tem certeza que deseja excluir este orçamento?')) {
        quotes = quotes.filter(q => q.id !== quoteId);
        localStorage.setItem('quotes', JSON.stringify(quotes));
        updateQuotesTable();
        showNotification('Orçamento excluído com sucesso!');
    }
}

// Gerar PDF de Orçamento com layout Kraken Tattoo
function generatePDF(quoteId) {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;

    // Pergunta a forma de pagamento e desconto total
    const paymentMethod = prompt(
        'Forma de pagamento (ex: Pix, Cartão, Dinheiro):',
        'Pix'
    ) || 'Pix';

    let discountStr = prompt(
        'Desconto total em R$ (se não houver, deixe 0):',
        '0'
    );
    if (discountStr === null) discountStr = '0';
    const discount = parseFloat(discountStr.replace(',', '.')) || 0;
    const totalWithDiscount = Math.max(quote.total - discount, 0);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;

    // Função que realmente desenha o PDF (com ou sem logo)
    function drawPDF(logoImg) {
        doc.setFont('helvetica', 'normal');

        // ---------- CABEÇALHO ----------
        if (logoImg) {
            // Logo do estúdio
            doc.addImage(logoImg, 'PNG', margin, margin, 30, 30);
        }

        doc.setFontSize(18);
        doc.setTextColor(88, 28, 135); // roxo forte
        doc.text('KRAKEN TATTOO', pageWidth / 2, margin + 10, { align: 'center' });

        doc.setFontSize(11);
        doc.setTextColor(100, 100, 110);
        doc.text('Orçamento de Produtos / Serviços', pageWidth / 2, margin + 18, {
            align: 'center'
        });

        // ---------- BLOCO DADOS BÁSICOS ----------
        let y = margin + 30;

        doc.setDrawColor(220);
        doc.setFillColor(248, 249, 252);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 24, 3, 3, 'F');

        const dateBR = quote.date.split('-').reverse().join('/');
        const leftX = margin + 4;
        const midX = pageWidth / 2;

        doc.setFontSize(11);
        doc.setTextColor(40, 40, 45);
        doc.text(`Cliente: ${quote.clientName}`, leftX, y + 7);
        doc.text(`Orçamento: #${quote.id}`, leftX, y + 14);

        doc.text(`Data de emissão: ${dateBR}`, midX, y + 7);
        doc.text(`Forma de pagamento: ${paymentMethod}`, midX, y + 14);

        // ---------- TÍTULO ITENS ----------
        y += 32;
        doc.setFontSize(12);
        doc.setTextColor(88, 28, 135);
        doc.text('Itens do Orçamento', margin, y);

        // linha abaixo do título
        y += 4;
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);

        // pequeno espaço antes da barra roxa
        y += 6;

        // ---------- TABELA DE ITENS ----------
        const tableWidth = pageWidth - margin * 2;
        const colCode = 18;
        const colDesc = 68;
        const colQty = 15;
        const colUnit = 24;
        const colDisc = 22;
        const colTotal = tableWidth - (colCode + colDesc + colQty + colUnit + colDisc);

        // Cabeçalho da tabela (BARRA ROXA)
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.setFillColor(88, 28, 135); // roxo
        const headerHeight = 8;

        const headerY = y; // salva posição da barra
        doc.rect(margin, headerY, tableWidth, headerHeight, 'F');

        let x = margin + 2;
        doc.text('Código', x, headerY + 5);
        x += colCode;
        doc.text('Descrição', x, headerY + 5);
        x += colDesc;
        doc.text('Quant.', x, headerY + 5);
        x += colQty;
        doc.text('Vlr Unit.', x, headerY + 5);
        x += colUnit;
        doc.text('Descontos', x, headerY + 5);
        x += colDisc;
        doc.text('Total', x, headerY + 5);

        // Linhas de itens
        const rowHeight = 7;
        y = headerY + headerHeight + 6; // começa as linhas BEM depois da barra roxa

        doc.setFontSize(10);
        doc.setTextColor(40, 40, 45);

        quote.items.forEach((item, index) => {
            x = margin + 2;

            // fundo listrado suave, agora SEM invadir o cabeçalho
            if (index % 2 === 0) {
                doc.setFillColor(245, 243, 255);
                doc.rect(margin, y - 5, tableWidth, rowHeight + 2, 'F');
            }

            const code = item.id ? String(item.id) : String(index + 1);
            const itemTotal = item.total;

            doc.text(code, x, y);
            x += colCode;
            doc.text(String(item.name).substring(0, 40), x, y);
            x += colDesc;
            doc.text(String(item.quantity), x, y);
            x += colQty;
            doc.text(`R$ ${item.price.toFixed(2)}`, x, y);
            x += colUnit;
            doc.text('-', x, y); // coluna descontos por item (não usada por enquanto)
            x += colDisc;
            doc.text(`R$ ${itemTotal.toFixed(2)}`, x, y);

            doc.setDrawColor(230);
            doc.line(margin, y + rowHeight - 2, margin + tableWidth, y + rowHeight - 2);

            y += rowHeight;
        });

        // ---------- RESUMO / TOTAIS ----------
        y += 8;
        const boxWidth = 80;
        const boxX = pageWidth - margin - boxWidth;

        doc.setDrawColor(210);
        doc.setFillColor(248, 249, 252);
        doc.roundedRect(boxX, y, boxWidth, 26, 2, 2, 'F');

        doc.setFontSize(10);
        doc.setTextColor(40, 40, 45);
        doc.text(`Subtotal: R$ ${quote.total.toFixed(2)}`, boxX + 4, y + 9);
        doc.text(`Desconto: R$ ${discount.toFixed(2)}`, boxX + 4, y + 15);

        doc.setFontSize(11);
        doc.setTextColor(88, 28, 135);
        doc.text(`Total do orçamento: R$ ${totalWithDiscount.toFixed(2)}`, boxX + 4, y + 22);

        // ---------- RODAPÉ ----------
        const footerY = 285;
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 155);
        doc.text(`Data do orçamento: ${dateBR}`, margin, footerY);
        doc.text(
            'Kraken Tattoo - Orçamento gerado por Kraken Tattoo',
            pageWidth / 2,
            footerY,
            { align: 'center' }
        );

        doc.save(`orcamento_${quote.id}.pdf`);
    }

    // ---------- Carrega logo (assíncrono) ----------
    const logoPath = 'logo-kraken.png'; // coloque esse arquivo na mesma pasta do app
    const img = new Image();
    img.src = logoPath;

    img.onload = function () {
        drawPDF(img);
    };

    img.onerror = function () {
        console.warn('Não foi possível carregar a logo, gerando PDF sem imagem.');
        drawPDF(null);
    };
}

// Add transaction
function addTransaction() {
    const type = document.getElementById('transaction-type').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const description = document.getElementById('transaction-description').value;
    
    if (isNaN(amount) || amount <= 0) {
        showNotification('Valor inválido', 'error');
        return;
    }
    
    transactions.push({
        id: transactions.length + 1,
        type: type,
        amount: amount,
        description: description,
        date: new Date().toISOString().split('T')[0]
    });
    
    localStorage.setItem('transactions', JSON.stringify(transactions));
    updateCashier();
    updateCashierChart();
    showNotification('Transação registrada com sucesso!');
    
    // Clear form
    document.getElementById('transaction-amount').value = '';
    document.getElementById('transaction-description').value = '';
}

// Update cashier
function updateCashier() {
    const tbody = document.getElementById('cashier-body');
    tbody.innerHTML = '';
    
    let balance = 0;
    transactions.forEach(transaction => {
        const row = document.createElement('tr');
        const amount = transaction.amount;
        if (transaction.type === 'entrada') {
            balance += amount;
            row.innerHTML = `
                <td>${transaction.date}</td>
                <td style="color: green;">Entrada</td>
                <td style="color: green;">R$ ${amount.toFixed(2)}</td>
                <td>${transaction.description}</td>
            `;
        } else {
            balance -= amount;
            row.innerHTML = `
                <td>${transaction.date}</td>
                <td style="color: red;">Saída</td>
                <td style="color: red;">R$ ${amount.toFixed(2)}</td>
                <td>${transaction.description}</td>
            `;
        }
        tbody.appendChild(row);
    });
    
    document.getElementById('cashier-balance').textContent = `Saldo do período: R$ ${balance.toFixed(2)}`;
}

// Update summary
function updateSummary() {
    const totalInventoryValue = inventory.reduce((sum, product) => sum + (product.quantity * product.price), 0);
    const totalQuotes = quotes.filter(q => q.status === 'Pendente').reduce((sum, quote) => sum + quote.total, 0);
    const confirmedOrders = quotes.filter(q => q.status === 'Confirmado').length;
    const totalClients = clients.length;
    
    const summary = document.getElementById('summary');
    summary.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            <div style="background: rgba(67, 97, 238, 0.1); padding: 15px; border-radius: 8px;">
                <h3 style="color: var(--primary); margin-bottom: 5px;">Valor Total em Estoque</h3>
                <p style="font-size: 20px; font-weight: bold;">R$ ${totalInventoryValue.toFixed(2)}</p>
            </div>
            <div style="background: rgba(247, 37, 133, 0.1); padding: 15px; border-radius: 8px;">
                <h3 style="color: var(--danger); margin-bottom: 5px;">Orçamentos Pendentes</h3>
                <p style="font-size: 20px; font-weight: bold;">R$ ${totalQuotes.toFixed(2)}</p>
            </div>
            <div style="background: rgba(76, 201, 240, 0.1); padding: 15px; border-radius: 8px;">
                <h3 style="color: var(--success); margin-bottom: 5px;">Pedidos Confirmados</h3>
                <p style="font-size: 20px; font-weight: bold;">${confirmedOrders}</p>
            </div>
            <div style="background: rgba(248, 150, 30, 0.1); padding: 15px; border-radius: 8px;">
                <h3 style="color: var(--warning); margin-bottom: 5px;">Clientes Cadastrados</h3>
                <p style="font-size: 20px; font-weight: bold;">${totalClients}</p>
            </div>
        </div>
    `;
}

// Chart
let salesChart = null;

function initChart() {
    const ctx = document.getElementById('salesChart').getContext('2d');
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Vendas Diárias (R$)',
                data: [],
                borderColor: '#4361ee',
                backgroundColor: 'rgba(67, 97, 238, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updateChart() {
    if (!salesChart) return;
    
    // Get last 7 days of confirmed orders
    const last7Days = [];
    const salesData = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        last7Days.push(dateStr);
        
        const dailySales = quotes
            .filter(q => q.status === 'Confirmado' && q.date === dateStr)
            .reduce((sum, quote) => sum + quote.total, 0);
            
        salesData.push(dailySales);
    }
    
    salesChart.data.labels = last7Days;
    salesChart.data.datasets[0].data = salesData;
    salesChart.update();
}

// Cashier Chart (DOUGHNUT)
let cashierChart = null;

function initCashierChart() {
    const ctx = document.getElementById('cashierChart').getContext('2d');
    cashierChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Utilizado (Despesas)', 'Disponível'],
            datasets: [{
                data: [0, 100],
                backgroundColor: [
                    'rgba(231, 76, 60, 0.8)',  // vermelho
                    'rgba(46, 204, 113, 0.8)' // verde
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateCashierChart() {
    if (!cashierChart) return;
    
    let totalEntries = 0;
    let totalExits = 0;

    transactions.forEach(t => {
        if (t.type === 'entrada') {
            totalEntries += t.amount;
        } else if (t.type === 'saida') {
            totalExits += t.amount;
        }
    });

    let usedPercent = 0;
    let availablePercent = 100;

    if (totalEntries > 0) {
        usedPercent = Math.min((totalExits / totalEntries) * 100, 100);
        availablePercent = 100 - usedPercent;
    }

    cashierChart.data.datasets[0].data = [usedPercent, availablePercent];
    cashierChart.update();

    const usageDiv = document.getElementById('cashier-usage');
    if (totalEntries > 0) {
        usageDiv.textContent = `${usedPercent.toFixed(2)}% da receita utilizada no período.`;
    } else {
        usageDiv.textContent = 'Nenhuma movimentação registrada no período.';
    }
}

/* ===== NOVA FUNÇÃO: LIMPAR EXTRATO DO CAIXA ===== */
function clearCashier() {
    if (!confirm('Tem certeza que deseja limpar todo o extrato do caixa? Esta ação não pode ser desfeita.')) {
        return;
    }

    transactions = [];
    localStorage.setItem('transactions', JSON.stringify(transactions));

    updateCashier();
    updateCashierChart();
    showNotification('Extrato do caixa limpo com sucesso!');
}
/* ================================================ */

// Quick Sale Functions
function showQuickSale() {
    quickSaleCents = 0;
    document.getElementById('quick-sale').classList.remove('hidden');
    document.getElementById('quick-sale-amount').textContent = '0,00';
    document.getElementById('quick-sale-desc').textContent = 'Venda Rápida';
    document.getElementById('quick-sale').style.display = 'block';
}

function hideQuickSale() {
    document.getElementById('quick-sale').classList.add('hidden');
    document.getElementById('quick-sale').style.display = 'none';
}

function formatCentsToBRL(cents) {
    const value = cents / 100;
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function addToAmount(digit) {
    quickSaleCents = quickSaleCents * 10 + parseInt(digit, 10);
    document.getElementById('quick-sale-amount').textContent = formatCentsToBRL(quickSaleCents);
}

function backspaceAmount() {
    quickSaleCents = Math.floor(quickSaleCents / 10);
    document.getElementById('quick-sale-amount').textContent = formatCentsToBRL(quickSaleCents);
}

function saveQuickSale() {
    if (quickSaleCents <= 0) {
        showNotification('Valor inválido', 'error');
        return;
    }

    const amount = quickSaleCents / 100;
    
    transactions.push({
        id: transactions.length + 1,
        type: 'entrada',
        amount: amount,
        description: document.getElementById('quick-sale-desc').textContent,
        date: new Date().toISOString().split('T')[0]
    });
    
    localStorage.setItem('transactions', JSON.stringify(transactions));
    updateCashier();
    updateCashierChart();
    hideQuickSale();
    showNotification('Venda rápida registrada com sucesso!');
}

// Quick Exit Functions
function showQuickExit() {
    quickExitCents = 0;
    document.getElementById('quick-exit').classList.remove('hidden');
    document.getElementById('quick-exit-amount').textContent = '0,00';
    document.getElementById('quick-exit-desc').textContent = 'Saída Rápida';
    document.getElementById('quick-exit').style.display = 'block';
}

function hideQuickExit() {
    document.getElementById('quick-exit').classList.add('hidden');
    document.getElementById('quick-exit').style.display = 'none';
}

function addToExitAmount(digit) {
    quickExitCents = quickExitCents * 10 + parseInt(digit, 10);
    document.getElementById('quick-exit-amount').textContent = formatCentsToBRL(quickExitCents);
}

function backspaceExitAmount() {
    quickExitCents = Math.floor(quickExitCents / 10);
    document.getElementById('quick-exit-amount').textContent = formatCentsToBRL(quickExitCents);
}

function saveQuickExit() {
    if (quickExitCents <= 0) {
        showNotification('Valor inválido', 'error');
        return;
    }

    const amount = quickExitCents / 100;
    
    transactions.push({
        id: transactions.length + 1,
        type: 'saida',
        amount: amount,
        description: document.getElementById('quick-exit-desc').textContent,
        date: new Date().toISOString().split('T')[0]
    });
    
    localStorage.setItem('transactions', JSON.stringify(transactions));
    updateCashier();
    updateCashierChart();
    hideQuickExit();
    showNotification('Saída rápida registrada com sucesso!');
}

// ======== CALCULADORA RÁPIDA ==========
let calcExpression = '';

function showCalculator() {
    const modal = document.getElementById('calculator-modal');
    calcExpression = '';
    updateCalculatorDisplay('0');
    modal.classList.remove('hidden');
}

function closeCalculator() {
    const modal = document.getElementById('calculator-modal');
    modal.classList.add('hidden');
}

function updateCalculatorDisplay(value) {
    document.getElementById('calc-display').textContent = value || '0';
}

function handleCalcKey(key) {
    if (key === 'C') {
        calcExpression = '';
        updateCalculatorDisplay('0');
        return;
    }

    if (key === '←') {
        calcExpression = calcExpression.slice(0, -1);
        updateCalculatorDisplay(calcExpression || '0');
        return;
    }

    if (key === '=') {
        if (!calcExpression.trim()) return;

        // permite números, sinais, vírgula/ponto e %
        const safe = /^[0-9+\-*/.,% ()]+$/.test(calcExpression);
        if (!safe) {
            alert('Expressão inválida.');
            return;
        }

        // troca vírgula por ponto
        let expr = calcExpression.replace(/,/g, '.');

        // 1) trata casos do tipo: 500+10% ou 500-10%
        // vira: 500 + (500*10/100) ou 500 - (500*10/100)
        expr = expr.replace(
            /(\d+(\.\d+)?)[ ]*([+\-])[ ]*(\d+(\.\d+)?)[ ]*%/g,
            (match, num1, _a, op, num2) => `(${num1}${op}(${num1}*${num2}/100))`
        );

        // 2) qualquer outro "n%" vira (n/100)
        // ex.: 200*10% => 200*(10/100)
        expr = expr.replace(/(\d+(\.\d+)?)[ ]*%/g, '($1/100)');

        try {
            const result = eval(expr);
            if (!isFinite(result)) throw new Error('Resultado inválido');
            const formatted = result.toLocaleString('pt-BR', {
                maximumFractionDigits: 4
            });
            calcExpression = String(result);
            updateCalculatorDisplay(formatted);
        } catch (e) {
            alert('Erro no cálculo. Confira os números.');
        }
        return;
    }

    // Qualquer outro botão (número, operador ou %)
    calcExpression += key;
    updateCalculatorDisplay(calcExpression);
}
