const mysql = require('mysql2/promise');
const { conexao, configServidor, nomeBanco } = require('./connection');

async function inicializarBanco() {
    if (!Number.isInteger(configServidor.port) || configServidor.port < 1 || configServidor.port > 65535) {
        throw new Error('DB_PORT deve ser um número inteiro entre 1 e 65535.');
    }

    const servidor = await mysql.createConnection(configServidor);
    try {
        // Escape de identificador: o nome configurado nunca é tratado como SQL.
        await servidor.query(
            `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(nomeBanco)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
    } finally {
        await servidor.end();
    }

    // IF NOT EXISTS preserva a tabela e os dados a cada reinício do nodemon.
    await conexao.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT NOT NULL AUTO_INCREMENT,
            nome VARCHAR(150) NOT NULL,
            celular VARCHAR(20) NOT NULL,
            email VARCHAR(150) NOT NULL,
            estado CHAR(2) NOT NULL,
            diocese VARCHAR(150) NOT NULL,
            tlc VARCHAR(150) NOT NULL,
            senha_hash VARCHAR(255) NOT NULL COMMENT 'Armazenar hash da senha',
            criado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_usuarios_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

function mensagemErroBanco(erro) {
    const codigo = erro.code || erro.errors?.find(item => item.code)?.code;
    switch (codigo) {
        case 'ECONNREFUSED':
            return 'Não foi possível conectar ao MySQL: o MySQL não está rodando ou DB_HOST/DB_PORT estão incorretos. Verifique o serviço e o arquivo .env.';
        case 'ER_ACCESS_DENIED_ERROR':
            return 'Acesso negado ao MySQL: usuário/senha incorretos ou usuário não autorizado neste host. Confira DB_USER e DB_PASSWORD no .env.';
        case 'ER_DBACCESS_DENIED_ERROR':
        case 'ER_TABLEACCESS_DENIED_ERROR':
            return 'O usuário MySQL não tem permissão para criar ou acessar o banco e as tabelas. Confira as permissões do usuário configurado no .env.';
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
            return 'Servidor MySQL não encontrado. Confira DB_HOST no arquivo .env.';
        case 'ETIMEDOUT':
            return 'O MySQL não respondeu a tempo. Verifique o serviço, DB_HOST, DB_PORT e a conexão de rede.';
        default:
            return `Não foi possível preparar o banco MySQL (${codigo || 'erro de configuração'}): ${erro.message}`;
    }
}

module.exports = { inicializarBanco, mensagemErroBanco };
