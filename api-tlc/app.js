// Importar módulo express
const express = require('express');

// Importar módulo express-handlesbars
const {engine} = require('express-handlebars')

const { inicializarBanco, mensagemErroBanco } = require('./db/init');
const { conexao } = require('./db/connection');

// App
const app = express();

// Pasta public: libera seus CSS e imagens 
app.use(express.static('public'));

//Adicionar Bootstrap
app.use('/bootstrap', express.static('./node_modules/bootstrap/dist'));

//Configuração do express-handlesbars
app. engine('handlebars', engine());
app. set('view engine', 'handlebars');
app.set('views', './views');

// Rota principal
app.get('/', (req, res) => {
    res.render('pagEntrar', { estilo: 'entrar' });
});

// Rota pag cadastrar
app.get('/cadastrar', (req, res) => {
    res.render('pagCadastrar', { estilo: 'cadastrar' });
});

// Só disponibilizar as rotas depois de preparar o banco.
async function iniciar() {
    try {
        await inicializarBanco();
        console.log('Banco e tabelas prontos!');
    } catch (erro) {
        console.error(mensagemErroBanco(erro));
        await conexao.end();
        process.exitCode = 1;
        return;
    }

    const servidor = app.listen(8080, (erro) => {
        if (!erro) console.log('Servidor disponível em http://localhost:8080');
    });
    servidor.on('error', async (erro) => {
        console.error(erro.code === 'EADDRINUSE'
            ? 'A porta 8080 já está em uso. Encerre o outro servidor e tente novamente.'
            : `Não foi possível iniciar o servidor: ${erro.message}`);
        await conexao.end();
        process.exitCode = 1;
    });
}

iniciar();
