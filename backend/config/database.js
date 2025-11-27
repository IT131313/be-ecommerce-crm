const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'auth_db'
};

const pool = mysql.createPool(dbConfig);

const dbAsync = {
  run: async (sql, params = []) => {
    try {
      const [result] = await pool.execute(sql, params);
      return { lastID: result.insertId, changes: result.affectedRows };
    } catch (error) {
      throw error;
    }
  },
  get: async (sql, params = []) => {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows[0] || null;
    } catch (error) {
      throw error;
    }
  },
  all: async (sql, params = []) => {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (error) {
      throw error;
    }
  },
  getConnection: () => pool.getConnection()
};

pool.getConnection()
  .then(connection => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to database:', err);
  });

module.exports = {
  ...dbAsync,
  pool
};
