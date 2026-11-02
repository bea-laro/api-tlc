const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');

// Estas opções também permitem conectar ao servidor antes de o banco existir.
const configServidor = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    port: Number(process.env.DB_PORT || 3306),
    charset: 'utf8mb4',
};
const nomeBanco = process.env.DB_NAME || 'apitlc';

// O pool só abre conexões quando uma consulta é executada.
const conexao = mysql.createPool({
    ...configServidor,
    database: nomeBanco,
    waitForConnections: true,
    connectionLimit: 10,
});

module.exports = { conexao, configServidor, nomeBanco };
