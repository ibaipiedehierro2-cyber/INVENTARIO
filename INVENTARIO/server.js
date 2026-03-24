const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_segura_2024';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'inventario',
  password: process.env.DB_PASSWORD || 'inventario',
  database: process.env.DB_NAME || 'inventario',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let pool;

// ==================== MIDDLEWARE ====================

// Middleware para verificar token JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// Middleware para verificar permisos según rol
const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (!requiredRoles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Permisos insuficientes' });
    }

    next();
  };
};

// ==================== INICIALIZACIÓN DB ====================

async function initDb() {
  pool = mysql.createPool(dbConfig);

  // Crear tabla de usuarios
  const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('admin', 'user', 'readonly') NOT NULL DEFAULT 'readonly',
    activo BOOLEAN DEFAULT TRUE,
    fecha_creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;
  `;

  // Crear tabla de productos
  const createProductsTable = `
  CREATE TABLE IF NOT EXISTS products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    serie VARCHAR(255),
    categoria VARCHAR(100) NOT NULL,
    cantidad_total INT NOT NULL DEFAULT 0,
    cantidad_disponible INT NOT NULL DEFAULT 0,
    fecha_anadido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB;
  `;

  // Crear tabla de reservaciones
  const createReservationsTable = `
  CREATE TABLE IF NOT EXISTS reservations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    usuario VARCHAR(255) NOT NULL,
    cantidad INT NOT NULL,
    fecha DATE NOT NULL,
    estado ENUM('activa','devuelta') NOT NULL DEFAULT 'activa',
    fecha_creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB;
  `;

  try {
    await pool.query(createUsersTable);
    await pool.query(createProductsTable);
    await pool.query(createReservationsTable);
    
    // Crear usuario admin por defecto si no existe
    const [existingUsers] = await pool.query('SELECT * FROM users WHERE username = ?', ['admin']);
    if (existingUsers.length === 0) {
      const hashedPassword = await bcryptjs.hash('admin123', 10);
      await pool.query(
        'INSERT INTO users (username, email, password_hash, rol) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@inventario.local', hashedPassword, 'admin']
      );
      console.log('Usuario admin creado con contraseña: admin123');
    }
  } catch (error) {
    console.error('Error inicializando tablas:', error);
    throw error;
  }
}


// ==================== RUTAS DE AUTENTICACIÓN ====================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE username = ? AND activo = TRUE', [username]);

    if (users.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const user = users[0];
    const passwordValid = await bcryptjs.compare(password, user.password_hash);

    if (!passwordValid) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        rol: user.rol,
        email: user.email
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en login' });
  }
});

// Verificar token
app.get('/api/auth/verify', verifyToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// Logout (solo un endpoint simbólico, la mayoría del trabajo es en el cliente)
app.post('/api/auth/logout', verifyToken, (req, res) => {
  res.json({ success: true });
});

// ==================== RUTAS DE USUARIOS (Solo Admin) ====================

// Obtener todos los usuarios
app.get('/api/users', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, rol, activo, fecha_creado FROM users'
    );
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// Crear nuevo usuario (solo admin)
app.post('/api/users', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const { username, email, password, rol } = req.body;

    if (!username || !password || !rol) {
      return res.status(400).json({ error: 'Usuario, contraseña y rol son requeridos' });
    }

    // Validar rol
    if (!['admin', 'user', 'readonly'].includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    // Verificar si el usuario ya existe
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, rol) VALUES (?, ?, ?, ?)',
      [username, email || null, hashedPassword, rol]
    );

    const [newUser] = await pool.query(
      'SELECT id, username, email, rol, activo, fecha_creado FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// Actualizar usuario (admin puede actualizar cualquiera, user solo su perfil)
app.patch('/api/users/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, rol } = req.body;

    // Verificar permisos
    if (req.user.rol !== 'admin' && req.user.id != id) {
      return res.status(403).json({ error: 'No puedes modificar otros usuarios' });
    }

    // Si es admin, puede cambiar rol, sino solo puede cambiar email y password
    const updates = [];
    const params = [];

    if (email) {
      updates.push('email = ?');
      params.push(email);
    }

    if (password) {
      const hashedPassword = await bcryptjs.hash(password, 10);
      updates.push('password_hash = ?');
      params.push(hashedPassword);
    }

    if (req.user.rol === 'admin' && rol && ['admin', 'user', 'readonly'].includes(rol)) {
      updates.push('rol = ?');
      params.push(rol);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    params.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const [updated] = await pool.query(
      'SELECT id, username, email, rol, activo, fecha_creado FROM users WHERE id = ?',
      [id]
    );

    res.json(updated[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// Desactivar usuario (solo admin)
app.delete('/api/users/:id', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Evitar que se elimine a sí mismo
    if (req.user.id == id) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    }

    await pool.query('UPDATE users SET activo = FALSE WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al desactivar usuario' });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// ==================== RUTAS DE PRODUCTOS ====================

// Obtener productos (todos pueden leer)
app.get('/api/products', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, COALESCE(SUM(r.cantidad), 0) AS reservado
      FROM products p
      LEFT JOIN reservations r ON r.product_id = p.id AND r.estado = 'activa'
      GROUP BY p.id
      ORDER BY p.nombre
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Crear producto (admin y user)
app.post('/api/products', verifyToken, requireRole(['admin', 'user']), async (req, res) => {
  try {
    const { nombre, serie, categoria, cantidad } = req.body;
    if (!nombre || !categoria || !cantidad || cantidad <= 0) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    const [result] = await pool.query(
      'INSERT INTO products (nombre, serie, categoria, cantidad_total, cantidad_disponible) VALUES (?, ?, ?, ?, ?)',
      [nombre, serie || '', categoria, cantidad, cantidad]
    );

    const [newProductRows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json(newProductRows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el producto' });
  }
});

// Eliminar producto (solo admin)
app.delete('/api/products/:id', verifyToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// Crear reservación (admin y user)
app.post('/api/products/:id/reserve', verifyToken, requireRole(['admin', 'user']), async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, cantidad, fecha } = req.body;

    if (!usuario || !cantidad || cantidad <= 0) {
      return res.status(400).json({ error: 'Datos de reservación inválidos' });
    }

    const [products] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    const product = products[0];
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (product.cantidad_disponible < cantidad) {
      return res.status(400).json({ error: 'Cantidad insuficiente disponible' });
    }

    await pool.query('INSERT INTO reservations (product_id, usuario, cantidad, fecha, estado) VALUES (?, ?, ?, ?, ?)',
      [id, usuario, cantidad, fecha || new Date().toISOString().slice(0, 10), 'activa']);

    await pool.query('UPDATE products SET cantidad_disponible = cantidad_disponible - ? WHERE id = ?', [cantidad, id]);

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al reservar producto' });
  }
});

// ==================== RUTAS DE RESERVACIONES ====================

// Obtener reservaciones (todos pueden leer)
app.get('/api/reservations', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, p.nombre AS producto_nombre, p.categoria
      FROM reservations r
      JOIN products p ON p.id = r.product_id
      ORDER BY r.estado, r.fecha_creado DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener reservaciones' });
  }
});

// Devolver reservación (admin y user)
app.post('/api/reservations/:id/return', verifyToken, requireRole(['admin', 'user']), async (req, res) => {
  try {
    const { id } = req.params;

    const [reservations] = await pool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    const reservation = reservations[0];

    if (!reservation || reservation.estado !== 'activa') {
      return res.status(404).json({ error: 'Reservación no encontrada o ya devuelta' });
    }

    await pool.query('UPDATE reservations SET estado = ? WHERE id = ?', ['devuelta', id]);
    await pool.query('UPDATE products SET cantidad_disponible = cantidad_disponible + ? WHERE id = ?', [reservation.cantidad, reservation.product_id]);

    const [updated] = await pool.query('SELECT * FROM reservations WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al devolver reserva' });
  }
});

// Actualizar producto (admin y user)
app.patch('/api/products/:id', verifyToken, requireRole(['admin', 'user']), async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad_total, cantidad_disponible, nombre, serie, categoria } = req.body;

    const [products] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!products[0]) return res.status(404).json({ error: 'Producto no existe' });

    const updates = [];
    const params = [];

    if (nombre) { updates.push('nombre = ?'); params.push(nombre); }
    if (serie !== undefined) { updates.push('serie = ?'); params.push(serie); }
    if (categoria) { updates.push('categoria = ?'); params.push(categoria); }
    if (cantidad_total !== undefined) { updates.push('cantidad_total = ?'); params.push(cantidad_total); }
    if (cantidad_disponible !== undefined) { updates.push('cantidad_disponible = ?'); params.push(cantidad_disponible); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(id);
    await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);

    const [updated] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    res.json(updated[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'inventario-v2.html'));
  } else {
    next();
  }
});

// ==================== INICIAR SERVIDOR ====================

initDb().then(() => {
  app.listen(port, () => {
    console.log(`Servidor ejecutando en http://localhost:${port}`);
    console.log('Credenciales por defecto: admin / admin123');
  });
}).catch(err => {
  console.error('Fallo inicialización DB', err);
  process.exit(1);
});
