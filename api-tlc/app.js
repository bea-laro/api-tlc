// Importar módulo express
const express = require('express');

// Importar módulo express-handlesbars
const {engine} = require('express-handlebars')

// Sessão que lembra quem fez login e embaralha a senha antes de salvar com o bcrypt
const session = require('express-session');
const bcrypt = require('bcryptjs');

const { inicializarBanco, mensagemErroBanco } = require('./db/init');
const { conexao } = require('./db/connection');

// App
const app = express();

app.use(express.static('public'));


app.use('/bootstrap', express.static('./node_modules/bootstrap/dist'));

//Configuração do express-handlesbars
app. engine('handlebars', engine());
app. set('view engine', 'handlebars');
app. set('views', './views');

// Permite ler o que a pessoa digitou nos formulários
app.use(express.urlencoded({ extended: true }));

// Sessão onde servidor guarda quem está logado
app.use(session({
    secret: process.env.SESSION_SECRET || 'troque-este-segredo-no-env',
    resave: false,
    saveUninitialized: false
}));

function exigirLogin(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect('/');
    }
    next();
}

// Rota principal (login). Se já estiver logado, vai direto para a home.
app.get('/', (req, res) => {
    if (req.session.usuario) {
        return res.redirect('/home');
    }
    res.render('pagEntrar', { estilo: 'entrar' });
});

// Recebe o formulário de login
app.post('/entrar', async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const senha = req.body.senha || '';

    try {
        // Procura a pessoa pelo e-mail
        const [linhas] = await conexao.execute(
            'SELECT id, nome, senha_hash FROM usuarios WHERE email = ?',
            [email]
        );
        const usuario = linhas[0];

        // Mensagem de e-mail ou senha errada
        const senhaCorreta = usuario && await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaCorreta) {
            return res.render('pagEntrar', { estilo: 'entrar', erro: 'E-mail ou senha incorretos.' });
        }

        // Guarda na sessão quem logou e manda para a área inicial
        req.session.usuario = { id: usuario.id, nome: usuario.nome };
        res.redirect('/home');
    } catch (erro) {
        console.error(erro);
        res.render('pagEntrar', { estilo: 'entrar', erro: 'Erro no servidor. Tente novamente.' });
    }
});

// Rota pag cadastrar
app.get('/cadastrar', (req, res) => {
    res.render('pagCadastrar', { estilo: 'cadastrar' });
});

// Recebe o formulário de cadastro
app.post('/cadastrar', async (req, res) => {
    const { nome, celular, estado, diocese, tlc, senha } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();

    // Conferindo
    if (!nome || !email || !celular || !estado || !diocese || !tlc || !senha) {
        return res.render('pagCadastrar', { estilo: 'cadastrar', erro: 'Preencha todos os campos.' });
    }

    try {
        // Salvando a senha embaralhada
        const senhaHash = await bcrypt.hash(senha, 10);

        await conexao.execute(
            'INSERT INTO usuarios (nome, celular, email, estado, diocese, tlc, senha_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nome.trim(), celular.trim(), email, estado, diocese.trim(), tlc.trim(), senhaHash]
        );

        // Caso deu certo ele vai para o login com um aviso verde
        res.render('pagEntrar', { estilo: 'entrar', sucesso: 'Cadastro realizado! Faça seu login.' });
    } catch (erro) {
        // se o e-mail já existe:
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.render('pagCadastrar', { estilo: 'cadastrar', erro: 'Este e-mail já está cadastrado.' });
        }
        console.error(erro);
        res.render('pagCadastrar', { estilo: 'cadastrar', erro: 'Não foi possível cadastrar. Tente novamente.' });
    }
});

// Área inicial 
app.get('/home', exigirLogin, (req, res) => {
    res.render('pagHome', { estilo: 'home', nome: req.session.usuario.nome });
});

// Sair
app.get('/sair', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// Só disponibiliza as rotas depois de preparar o banco
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
