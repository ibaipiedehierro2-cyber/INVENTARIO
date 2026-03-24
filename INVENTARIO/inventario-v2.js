let products = [];
let reservations = [];
let currentFilter = 'todos';
let currentCategoryFilter = 'todas';
let currentSearch = '';
let loanProductId = null;
let viewMode = 'cards';

const emojiMap = {
    componentes: '🔧',
    perifericos: '🖱️',
    monitores: '🖥️',
    cables: '🔌',
    software: '💾',
    accesorios: '📦'
};

function getCategoryEmoji(category) {
    return emojiMap[category] || '📦';
}

async function fetchProducts() {
    const res = await fetch('/api/products');
    products = await res.json();
}

async function fetchReservations() {
    const res = await fetch('/api/reservations');
    reservations = await res.json();
}

function toggleView() {
    viewMode = viewMode === 'cards' ? 'table' : 'cards';
    document.getElementById('itemsContainer').classList.toggle('hidden', viewMode === 'table');
    document.getElementById('tableView').classList.toggle('hidden', viewMode === 'cards');
    document.getElementById('toggleViewBtn').textContent = viewMode === 'table' ? '🖼️ Vista Tarjetas' : '🗂️ Vista Tabla';
    render();
}

function setLoanDateToToday() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('loanDate').value = today;
}

function toggleForm() {
    const form = document.getElementById('formContainer');
    const btn = document.getElementById('toggleFormBtn');
    form.classList.toggle('hidden');

    if (form.classList.contains('hidden')) {
        btn.innerHTML = '<span style="font-size: 1.3em;">+</span> Añadir Producto';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
    } else {
        btn.innerHTML = '✕ Cerrar formulario';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    }
}

function setFiltro(tipo, filtro, targetBtn) {
    if (tipo === 'estado') {
        currentFilter = filtro;
        document.querySelectorAll('#estadoFilters .filter-btn').forEach(btn => btn.classList.remove('active'));
        if (targetBtn) targetBtn.classList.add('active');
    } else if (tipo === 'categoria') {
        currentCategoryFilter = filtro;
        document.querySelectorAll('#categoryFilters .filter-btn').forEach(btn => btn.classList.remove('active'));
        if (targetBtn) targetBtn.classList.add('active');
    }
    render();
}

function getFilteredProducts() {
    return products
        .filter(item => (currentCategoryFilter === 'todas' || item.categoria === currentCategoryFilter))
        .filter(item => !currentSearch || item.nombre.toLowerCase().includes(currentSearch))
        .filter(item => {
            if (currentFilter === 'disponible') return item.cantidad_disponible > 0;
            if (currentFilter === 'prestado') return item.reservado > 0;
            return true;
        });
}

function formatCategory(category) {
    return `${getCategoryEmoji(category)} ${category.charAt(0).toUpperCase() + category.slice(1)}`;
}

function showEmptyState(show) {
    document.getElementById('emptyState').style.display = show ? 'block' : 'none';
}

function render() {
    const filtered = getFilteredProducts();

    const totalProductos = products.length;
    const totalReservado = products.reduce((acc, p) => acc + Number(p.reservado || 0), 0);
    const totalDisponible = products.reduce((acc, p) => acc + Number(p.cantidad_disponible || 0), 0);
    const cantidadTotal = products.reduce((acc, p) => acc + Number(p.cantidad_total || 0), 0);

    document.getElementById('stat-total').textContent = totalProductos;
    document.getElementById('stat-disponibles').textContent = totalDisponible;
    document.getElementById('stat-prestados').textContent = totalReservado;
    document.getElementById('stat-cantidad').textContent = cantidadTotal;

    const itemsContainer = document.getElementById('itemsContainer');
    const productsTableBody = document.querySelector('#productsTable tbody');
    const reservationsTableBody = document.querySelector('#reservationsTable tbody');

    itemsContainer.innerHTML = '';
    productsTableBody.innerHTML = '';
    reservationsTableBody.innerHTML = '';

    if (filtered.length === 0) {
        showEmptyState(true);
    } else {
        showEmptyState(false);
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-header">
                <div class="item-title">${item.nombre}</div>
                <span class="item-badge ${item.reservado > 0 ? 'borrowed' : ''}">${item.reservado > 0 ? '🔴 Reservado' : '🟢 Disponible'}</span>
            </div>
            <div class="item-info">
                <div class="info-row"><span class="info-label">Total:</span><span class="quantity-badge">${item.cantidad_total}</span></div>
                <div class="info-row"><span class="info-label">Disp.:</span><span class="quantity-badge">${item.cantidad_disponible}</span></div>
                <div class="info-row"><span class="info-label">Reserv.:</span><span>${item.reservado || 0}</span></div>
                <div class="info-row"><span class="info-label">Categoría:</span><span>${formatCategory(item.categoria)}</span></div>
                <div class="info-row"><span class="info-label">Serie:</span><span>${item.serie || '—'}</span></div>
            </div>
            <div class="item-actions">
                <button class="btn btn-secondary" onclick="startLoan(${item.id})" ${item.cantidad_disponible <= 0 ? 'disabled' : ''}>Reservar</button>
                <button class="btn btn-danger" onclick="deleteItem(${item.id})">🗑️ Eliminar</button>
            </div>
        `;
        itemsContainer.appendChild(card);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.nombre}</td>
            <td>${formatCategory(item.categoria)}</td>
            <td>${item.serie || '—'}</td>
            <td>${item.cantidad_total}</td>
            <td>${item.cantidad_disponible}</td>
            <td>${item.reservado || 0}</td>
            <td>${item.cantidad_disponible > 0 ? 'Disponible' : 'Agotado'}</td>
            <td>
                <button class="btn btn-secondary" onclick="startLoan(${item.id})" ${item.cantidad_disponible <= 0 ? 'disabled' : ''}>Reservar</button>
                <button class="btn btn-danger" onclick="deleteItem(${item.id})">Eliminar</button>
            </td>
        `;
        productsTableBody.appendChild(row);
    });

    reservations.forEach(res => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${res.id}</td>
            <td>${res.producto_nombre}</td>
            <td>${res.usuario}</td>
            <td>${res.cantidad}</td>
            <td>${res.fecha}</td>
            <td>${res.estado}</td>
            <td>${res.estado === 'activa' ? `<button class="btn btn-success" onclick="returnReservation(${res.id})">Marcar devuelta</button>` : ''}</td>
        `;
        reservationsTableBody.appendChild(row);
    });
}

async function addItem() {
    const nombre = document.getElementById('inputNombre').value.trim();
    const cantidad = parseInt(document.getElementById('inputCantidad').value, 10);
    const serie = document.getElementById('inputSerie').value.trim();
    const categoria = document.getElementById('inputCategoria').value;

    if (!nombre || !cantidad || cantidad <= 0) {
        return alert('Necesitas nombre y cantidad válida');
    }

    const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, serie, categoria, cantidad })
    });

    if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'No se pudo crear el producto');
    }

    document.getElementById('inputNombre').value = '';
    document.getElementById('inputCantidad').value = '1';
    document.getElementById('inputSerie').value = '';
    toggleForm();
    await refreshData();
}

async function deleteItem(id) {
    if (!confirm('¿Seguro eliminar?')) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    await refreshData();
}

function startLoan(productId) {
    loanProductId = productId;
    document.getElementById('loanName').value = '';
    document.getElementById('loanCantidad').value = '1';
    setLoanDateToToday();
    document.getElementById('loanModal').classList.add('active');
    document.getElementById('loanName').focus();
}

function closeLoanModal() {
    document.getElementById('loanModal').classList.remove('active');
    loanProductId = null;
}

async function confirmLoan() {
    const usuario = document.getElementById('loanName').value.trim();
    const cantidad = parseInt(document.getElementById('loanCantidad').value, 10);
    const fecha = document.getElementById('loanDate').value;

    if (!usuario || !cantidad || cantidad <= 0 || !loanProductId) {
        return alert('Complete usuario, cantidad y fecha.');
    }

    const res = await fetch(`/api/products/${loanProductId}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, cantidad, fecha })
    });

    if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'Error al reservar');
    }

    closeLoanModal();
    await refreshData();
}

async function returnReservation(reservationId) {
    await fetch(`/api/reservations/${reservationId}/return`, { method: 'POST' });
    await refreshData();
}

async function refreshData() {
    await Promise.all([fetchProducts(), fetchReservations()]);
    render();
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('input', e => {
        currentSearch = e.target.value.toLowerCase();
        render();
    });

    document.getElementById('loanModal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeLoanModal();
    });

    refreshData();
});
