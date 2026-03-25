// ==================== VARIABLES GLOBALES ====================
let products = [];
let reservations = [];
let users = [];
let currentUser = null;
let authToken = null;
let currentFilter = 'todos';
let currentCategoryFilter = 'todas';
let currentSearch = '';
let loanProductId = null;
let viewMode = 'cards';
let selectedUserId = null;

const emojiMap = {
    accesorios: '📦',
    adaptadores: '🔌',
    almacenamiento: '💾',
    altavoces: '🔊',
    auriculares: '🎧',
    baterias: '🔋',
    cables: '🔌',
    componentes: '🔧',
    conectores: '🔗',
    consumibles: '🗂️',
    disipadores: '🧊',
    docking: '🚪',
    escanneres: '📠',
    fotocopiadoras: '📋',
    firewalls: '🛡️',
    fuentes: '🔋',
    'fuentes-externas': '⚡',
    herramientas: '🔨',
    hubs: '🔀',
    impresoras: '🖨️',
    licencias: '📜',
    limpiezas: '🧹',
    memoria: '🧠',
    microfonos: '🎤',
    modems: '📶',
    monitores: '🖥️',
    mochilas: '🎒',
    papel: '📄',
    'patch-panels': '📋',
    perifericos: '🖱️',
    placas: '🔲',
    procesadores: '⚙️',
    refrigeracion: '❄️',
    routers: '📡',
    seguridad: '🔐',
    servidores: '💻',
    'servidores-almacen': '💾',
    software: '💾',
    switches: '🔄',
    soportes: '🖼️',
    ups: '⚡',
    'tarjetas-graficas': '🎮',
    'tarjetas-red': '🌐',
    'tinta-toner': '🖨️',
    tornilleria: '🔩',
    torres: '🏠',
    varios: '📦',
    ventiladores: '🌀',
    webcams: '📹',
    'pasta-termica': '🧴'
};

// ==================== AUTENTICACIÓN ====================

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    errorDiv.classList.add('hidden');

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
            const err = await res.json();
            errorDiv.textContent = err.error || 'Error al iniciar sesión';
            errorDiv.classList.remove('hidden');
            return;
        }

        const data = await res.json();
        authToken = data.token;
        currentUser = data.user;

        // Guardar en localStorage
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Mostrar app
        showMainApp();
        await refreshData();
    } catch (error) {
        console.error(error);
        errorDiv.textContent = 'Error de conexión';
        errorDiv.classList.remove('hidden');
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    // Limpiar formularios
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').classList.add('hidden');
    
    // Mostrar pantalla de login
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    // Mostrar información del usuario
    document.getElementById('userDisplayName').textContent = currentUser.username;
    const rolText = {
        admin: '👑 Administrador',
        user: '👤 Usuario',
        readonly: '👁️ Solo lectura'
    };
    document.getElementById('userDisplayRole').textContent = rolText[currentUser.rol] || currentUser.rol;
    
    // Mostrar panel admin solo si es admin
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if (currentUser.rol === 'admin') {
        adminPanelBtn.style.display = 'block';
    } else {
        adminPanelBtn.style.display = 'none';
    }

    // Desabilitar/habilitar botones según rol
    updateFormAccess();
}

function updateFormAccess() {
    const toggleFormBtn = document.getElementById('toggleFormBtn');
    
    // Solo admin y user pueden crear productos
    if (['admin', 'user'].includes(currentUser.rol)) {
        toggleFormBtn.style.display = 'block';
    } else {
        toggleFormBtn.style.display = 'none';
    }
}

function getCategoryEmoji(category) {
    return emojiMap[category] || '📦';
}

// ==================== API CALLS CON AUTENTICACIÓN ====================

async function apiCall(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    
    if (res.status === 401) {
        // Token expirado o inválido
        handleLogout();
        throw new Error('Sesión expirada');
    }

    return res;
}

async function fetchProducts() {
    try {
        const res = await apiCall('/api/products');
        if (!res.ok) throw new Error('Error al obtener productos');
        products = await res.json();
    } catch (error) {
        console.error('Error fetchProducts:', error);
    }
}

async function fetchReservations() {
    try {
        const res = await apiCall('/api/reservations');
        if (!res.ok) throw new Error('Error al obtener reservaciones');
        reservations = await res.json();
    } catch (error) {
        console.error('Error fetchReservations:', error);
    }
}

async function fetchUsers() {
    try {
        const res = await apiCall('/api/users');
        if (!res.ok) throw new Error('Error al obtener usuarios');
        users = await res.json();
        renderUsersList();
    } catch (error) {
        console.error('Error fetchUsers:', error);
    }
}

// ==================== FUNCIONES DE UI ====================

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

function toggleAdminPanel() {
    const adminPanel = document.getElementById('adminPanel');
    adminPanel.classList.toggle('hidden');
}

function setLoanDateToToday() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('loanDate').value = today;
}

function toggleView() {
    viewMode = viewMode === 'cards' ? 'table' : 'cards';
    document.getElementById('itemsContainer').classList.toggle('hidden', viewMode === 'table');
    document.getElementById('tableView').classList.toggle('hidden', viewMode === 'cards');
    document.getElementById('toggleViewBtn').textContent = viewMode === 'table' ? '🖼️ Vista Tarjetas' : '🗂️ Vista Tabla';
    render();
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

function setFiltroDropdown(tipo, filtro) {
    if (tipo === 'categoria') {
        currentCategoryFilter = filtro;
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

// ==================== RENDER ====================

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
        
        // Solo mostrar botón eliminar si es admin
        const deleteBtn = currentUser.rol === 'admin' ? 
            `<button class="btn btn-danger" onclick="deleteItem(${item.id})">🗑️ Eliminar</button>` : '';
        
        card.innerHTML = `
            <div class="item-header">
                <div class="item-title">${item.nombre}</div>
                <span class="item-badge">${item.cantidad_disponible === item.cantidad_total ? '🟢' : item.cantidad_disponible === 0 ? '🔴' : '🟠'}</span>
            </div>
            <div class="item-info">
                <div class="info-row"><span class="info-label">Total:</span><span class="quantity-badge">${item.cantidad_total}</span></div>
                <div class="info-row"><span class="info-label">Disp.:</span><span class="quantity-badge">${item.cantidad_disponible}</span></div>
                <div class="info-row"><span class="info-label">Reserv.:</span><span class="quantity-badge">${item.reservado || 0}</span></div>
                <div class="info-row"><span class="info-label">Categoría:</span><span>${formatCategory(item.categoria)}</span></div>
                <div class="info-row"><span class="info-label">Serie:</span><span>${item.serie || '—'}</span></div>
                ${item.caracteristicas ? `<div class="info-row"><span class="info-label">Características:</span><span class="characteristics-text">${item.caracteristicas}</span></div>` : ''}
            </div>
            <div class="item-actions">
                ${['admin', 'user'].includes(currentUser.rol) ? 
                    `<button class="btn btn-secondary" onclick="startLoan(${item.id})" ${item.cantidad_disponible <= 0 ? 'disabled' : ''}>Reservar</button>` : 
                    ''}
                ${deleteBtn}
            </div>
        `;
        itemsContainer.appendChild(card);

        const row = document.createElement('tr');
        
        const deleteAction = currentUser.rol === 'admin' ? 
            `<button class="btn btn-danger" onclick="deleteItem(${item.id})">Eliminar</button>` : '';
        
        const reserveAction = ['admin', 'user'].includes(currentUser.rol) ? 
            `<button class="btn btn-secondary" onclick="startLoan(${item.id})" ${item.cantidad_disponible <= 0 ? 'disabled' : ''}>Reservar</button>` : 
            '';
        
        row.innerHTML = `
            <td>${item.nombre}</td>
            <td>${formatCategory(item.categoria)}</td>
            <td>${item.serie || '—'}</td>
            <td>${item.cantidad_total}</td>
            <td>${item.cantidad_disponible}</td>
            <td>${item.reservado || 0}</td>
            <td>${item.cantidad_disponible > 0 ? 'Disponible' : 'Agotado'}</td>
            <td>
                ${reserveAction}
                ${deleteAction}
            </td>
        `;
        productsTableBody.appendChild(row);
    });

    reservations.forEach(res => {
        const row = document.createElement('tr');
        const returnBtn = ['admin', 'user'].includes(currentUser.rol) && res.estado === 'activa' ? 
            `<button class="btn btn-success" onclick="returnReservation(${res.id})">Marcar devuelta</button>` : '';
        
        row.innerHTML = `
            <td>${res.id}</td>
            <td>${res.producto_nombre}</td>
            <td>${res.usuario}</td>
            <td>${res.cantidad}</td>
            <td>${res.fecha}</td>
            <td>${res.estado}</td>
            <td>${returnBtn}</td>
        `;
        reservationsTableBody.appendChild(row);
    });
}

// ==================== GESTIÓN DE USUARIOS ====================

async function createNewUser() {
    const username = document.getElementById('adminUsername').value.trim();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const rol = document.getElementById('adminRole').value;

    if (!username || !password) {
        alert('Usuario y contraseña son requeridos');
        return;
    }

    try {
        const res = await apiCall('/api/users', 'POST', {
            username, email, password, rol
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Error al crear usuario');
            return;
        }

        alert('Usuario creado exitosamente');
        document.getElementById('adminUsername').value = '';
        document.getElementById('adminEmail').value = '';
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminRole').value = 'readonly';
        
        await fetchUsers();
    } catch (error) {
        console.error(error);
        alert('Error al crear usuario');
    }
}

function renderUsersList() {
    const usersTableBody = document.querySelector('#usersTable tbody');
    usersTableBody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');

        const roleControl = user.id !== currentUser.id ?
            `<select class="form-select" onchange="changeUserRole(${user.id}, this.value)">
                <option value="admin" ${user.rol === 'admin' ? 'selected' : ''}>admin</option>
                <option value="user" ${user.rol === 'user' ? 'selected' : ''}>user</option>
                <option value="readonly" ${user.rol === 'readonly' ? 'selected' : ''}>readonly</option>
            </select>` :
            `<span>${user.rol}</span>`;

        let statusBtn = '';
        if (user.id !== currentUser.id) {
            if (user.activo) {
                statusBtn = `<button class="btn btn-warning" onclick="toggleUserActive(${user.id}, false)">Desactivar</button>`;
            } else {
                statusBtn = `<button class="btn btn-success" onclick="toggleUserActive(${user.id}, true)">Activar</button>`;
            }
        }

        const deleteBtn = user.id !== currentUser.id ?
            `<button class="btn btn-danger" onclick="deleteUserPermanent(${user.id})">Eliminar</button>` :
            '';

        row.innerHTML = `
            <td>${user.username}</td>
            <td>${user.email || '—'}</td>
            <td>${roleControl}</td>
            <td>${user.activo ? 'Activo' : 'Desactivado'}</td>
            <td style="display: flex; gap: 6px; flex-wrap: wrap;">${statusBtn}${deleteBtn}</td>
        `;

        usersTableBody.appendChild(row);
    });
}

async function changeUserRole(userId, newRole) {
    try {
        const res = await apiCall(`/api/users/${userId}`, 'PATCH', { rol: newRole });
        if (!res.ok) {
            const err = await res.json();
            return alert(err.error || 'Error al cambiar rol');
        }
        await fetchUsers();
    } catch (error) {
        console.error(error);
        alert('Error al cambiar rol');
    }
}

async function toggleUserActive(userId, active) {
    try {
        const res = await apiCall(`/api/users/${userId}`, 'PATCH', { activo: active });
        if (!res.ok) {
            const err = await res.json();
            return alert(err.error || 'Error al actualizar estado');
        }
        await fetchUsers();
    } catch (error) {
        console.error(error);
        alert('Error al actualizar estado');
    }
}

async function deleteUserPermanent(userId) {
    if (!confirm('¿Eliminar permanentemente este usuario? Esta acción es irreversible.')) return;

    try {
        const res = await apiCall(`/api/users/${userId}/permanent`, 'DELETE');
        if (!res.ok) {
            const err = await res.json();
            return alert(err.error || 'Error al eliminar usuario');
        }
        await fetchUsers();
    } catch (error) {
        console.error(error);
        alert('Error al eliminar usuario');
    }
}

function prepareDeleteUser(userId) {
    selectedUserId = userId;
    document.getElementById('deleteUserModal').classList.add('active');
}

function closeDeleteUserModal() {
    document.getElementById('deleteUserModal').classList.remove('active');
    selectedUserId = null;
}

async function confirmDeleteUser() {
    if (!selectedUserId) return;

    try {
        const res = await apiCall(`/api/users/${selectedUserId}`, 'DELETE');

        if (!res.ok) {
            const err = await res.json();
            alert(err.error || 'Error al desactivar usuario');
            return;
        }

        alert('Usuario desactivado exitosamente');
        closeDeleteUserModal();
        await fetchUsers();
    } catch (error) {
        console.error(error);
        alert('Error al desactivar usuario');
    }
}

// ==================== GESTIÓN DE PRODUCTOS ====================

async function addItem() {
    const nombre = document.getElementById('inputNombre').value.trim();
    const cantidad = parseInt(document.getElementById('inputCantidad').value, 10);
    const serie = document.getElementById('inputSerie').value.trim();
    const caracteristicas = document.getElementById('inputCaracteristicas').value.trim();
    const categoria = document.getElementById('inputCategoria').value;

    if (!nombre || !cantidad || cantidad <= 0) {
        return alert('Necesitas nombre y cantidad válida');
    }

    try {
        const res = await apiCall('/api/products', 'POST', {
            nombre, serie, caracteristicas, categoria, cantidad
        });

        if (!res.ok) {
            const err = await res.json();
            return alert(err.error || 'No se pudo crear el producto');
        }

        document.getElementById('inputNombre').value = '';
        document.getElementById('inputCantidad').value = '1';
        document.getElementById('inputSerie').value = '';
        document.getElementById('inputCaracteristicas').value = '';
        toggleForm();
        await refreshData();
    } catch (error) {
        console.error(error);
        alert('Error al crear producto');
    }
}

async function deleteItem(id) {
    if (!confirm('¿Seguro eliminar este producto?')) return;
    
    try {
        const res = await apiCall(`/api/products/${id}`, 'DELETE');
        if (!res.ok) throw new Error('Error al eliminar');
        
        await refreshData();
    } catch (error) {
        console.error(error);
        alert('Error al eliminar producto');
    }
}

// ==================== GESTIÓN DE RESERVACIONES ====================

function startLoan(productId) {
    loanProductId = productId;
    const product = products.find(p => p.id === productId);
    document.getElementById('loanName').value = '';
    document.getElementById('loanQuantity').value = 1;
    document.getElementById('loanQuantity').max = product.cantidad_disponible;
    document.getElementById('maxQuantityText').textContent = `Máximo disponible: ${product.cantidad_disponible}`;
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
    const fecha = document.getElementById('loanDate').value;
    const cantidad = parseInt(document.getElementById('loanQuantity').value) || 1;

    if (!usuario || !loanProductId) {
        return alert('Complete usuario y cantidad.');
    }

    const product = products.find(p => p.id === loanProductId);
    
    if (cantidad > product.cantidad_disponible) {
        return alert(`Solo hay ${product.cantidad_disponible} disponibles`);
    }

    try {
        const res = await apiCall(`/api/products/${loanProductId}/reserve`, 'POST', {
            usuario, cantidad, fecha
        });

        if (!res.ok) {
            const err = await res.json();
            return alert(err.error || 'Error al reservar');
        }

        closeLoanModal();
        await refreshData();
    } catch (error) {
        console.error(error);
        alert('Error al reservar producto');
    }
}

async function returnReservation(reservationId) {
    try {
        const res = await apiCall(`/api/reservations/${reservationId}/return`, 'POST');
        if (!res.ok) throw new Error('Error al devolver');
        
        await refreshData();
    } catch (error) {
        console.error(error);
        alert('Error al devolver reserva');
    }
}

// ==================== INICIALIZACIÓN ====================

async function refreshData() {
    await Promise.all([fetchProducts(), fetchReservations()]);
    render();
}

async function initApp() {
    // Verificar si hay token guardado
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');

    if (savedToken && savedUser) {
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        
        // Verificar que el token sigue siendo válido
        try {
            const res = await apiCall('/api/auth/verify');
            if (res.ok) {
                showMainApp();
                await refreshData();
                return;
            }
        } catch (error) {
            console.log('Token inválido');
        }
    }

    // Mostrar pantalla de login
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', () => {
    // Inicializar app
    initApp();

    // Event listeners
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            currentSearch = e.target.value.toLowerCase();
            render();
        });
    }

    const loanModal = document.getElementById('loanModal');
    if (loanModal) {
        loanModal.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeLoanModal();
        });
    }

    const deleteUserModal = document.getElementById('deleteUserModal');
    if (deleteUserModal) {
        deleteUserModal.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeDeleteUserModal();
        });
    }
});
