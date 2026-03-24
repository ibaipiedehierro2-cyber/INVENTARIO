const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

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

async function initDb() {
  pool = mysql.createPool(dbConfig);

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

  await pool.query(createProductsTable);
  await pool.query(createReservationsTable);
}

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

app.get('/api/products', async (req, res) => {
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

app.post('/api/products', async (req, res) => {
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

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

app.post('/api/products/:id/reserve', async (req, res) => {
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

app.get('/api/reservations', async (req, res) => {
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

app.post('/api/reservations/:id/return', async (req, res) => {
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

app.patch('/api/products/:id', async (req, res) => {
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

initDb().then(() => {
  app.listen(port, () => {
    console.log(`Servidor ejecutando en http://localhost:${port}`);
  });
}).catch(err => {
  console.error('Fallo inicialización DB', err);
  process.exit(1);
});
