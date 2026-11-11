// Importar módulo express
const express = require('express');

// Importar módulo express-handlesbars
const {engine} = require('express-handlebars')

// Sessão que lembra quem fez login e embaralha a senha antes de salvar com o bcrypt
const session = require('express-session');
const bcrypt = require('bcryptjs');

const { inicializarBanco, mensagemErroBanco } = require('./db/init');
const { conexao } = require('./db/connection');

// Para receber arquivos e mexer em pastas
const path = require('path');
const fs = require('fs');
const multer = require('multer');

//Listas fixas 
const SUBREGIOES = ['Campinas', 'Sorocaba', 'Ribeirão Preto', 'Aparecida'];

//Pasta onde os pdfs e videos ficam guardados
fs.mkdirSync('uploads', { recursive: true });
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'uploads/'),
        filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
    }),
    // só aceita pdf ou vídeo
    fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('video/')),
    limits: { fileSize: 300 * 1024 * 1024 }
});

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
app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario;
    res.locals.subregioes = SUBREGIOES;
    if (req.session.usuario) {
        res.locals.nome = req.session.usuario.nome.split(' ')[0];
        res.locals.adm = req.session.usuario.adm;
    }
    next();
}); 

function exigirLogin(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect('/');
    }
    next();
}
    function exigirAdm(req, res, next) {
    if (!req.session.usuario.adm) {
        return res.redirect('/home');
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
            'SELECT id, nome, tipo, senha_hash FROM usuarios WHERE email = ?',
            [email]
        );
        const usuario = linhas[0];

        // Mensagem de e-mail ou senha errada
        const senhaCorreta = usuario && await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaCorreta) {
            return res.render('pagEntrar', { estilo: 'entrar', erro: 'E-mail ou senha incorretos.' });
        }

        // Guarda na sessão quem logou e manda para a área inicial
        req.session.usuario = { id: usuario.id, nome: usuario.nome, adm: usuario.tipo === 'adm' };
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
    res.render('pagHome', { layout: 'painel', titulo: 'Início', ativoHome: true });
});

//Relatorios so para o adm
app.get('/relatorios', exigirLogin, exigirAdm, async (req, res) => {
    const [[usuarios]] = await conexao.execute('SELECT COUNT(*) AS total FROM usuarios');
    const [[acessos]] = await conexao.execute('SELECT COUNT(*) AS total FROM acessos');

    // liga cada acesso ao material para saber o título
    const [porTema] = await conexao.execute(
        `SELECT m.titulo AS rotulo, COUNT(*) AS total
         FROM acessos a JOIN materiais m ON m.id = a.material_id
         GROUP BY m.titulo ORDER BY total DESC`
    );

    // acessos por sub-região: liga cada acesso ao usuário para saber a sub-região
    const [porSub] = await conexao.execute(
        `SELECT COALESCE(u.subregiao, 'Não informada') AS rotulo, COUNT(*) AS total
         FROM acessos a JOIN usuarios u ON u.id = a.usuario_id
         GROUP BY rotulo ORDER BY total DESC`
    );

    // transforma em texto JSON para o gráfico (o replace evita quebrar o HTML)
    const paraJson = lista => JSON.stringify(lista).replace(/</g, '\\u003c');

    res.render('pagRelatorios', {
        layout: 'painel', titulo: 'Relatórios', ativoRelatorios: true,
        totalUsuarios: usuarios.total,
        totalAcessos: acessos.total,
        porTemaJson: paraJson(porTema),
        porSubJson: paraJson(porSub)
    });
});

//ADM: ENVIAR MATERIAL

app.get('/admin/materiais', exigirLogin, exigirAdm, (req, res) => {
    res.render('pagEnviar', { layout: 'painel', titulo: 'Enviar material', ativoEnviar: true });
});

app.post('/admin/materiais', exigirLogin, exigirAdm, upload.single('arquivo'), async (req, res) => {
    const arquivo = req.file;
    if (!arquivo) {
        return res.render('pagEnviar', { layout: 'painel', titulo: 'Enviar material', ativoEnviar: true, erro: 'Envie um arquivo PDF ou de vídeo.' });
    }
    const tipo = arquivo.mimetype === 'application/pdf' ? 'pdf' : 'video';

    await conexao.execute(
        'INSERT INTO materiais (titulo, descricao, tipo, arquivo) VALUES (?, ?, ?, ?)',
        [req.body.titulo.trim(), (req.body.descricao || '').trim(), tipo, arquivo.filename]
    );
    res.render('pagEnviar', { layout: 'painel', titulo: 'Enviar material', ativoEnviar: true, sucesso: 'Material enviado!' });
});


//lista de materiais de um tema
app.get('/materiais', exigirLogin, async (req, res) => {
    const [materiais] = await conexao.execute(
        'SELECT id, titulo, descricao, tipo FROM materiais ORDER BY titulo'
    );
    res.render('pagMateriais', { layout: 'painel', titulo: 'Materiais', ativoMateriais: true, materiais });
});

//Abre um material e registra o para os relatórios
app.get('/material/:id', exigirLogin, async (req, res) => {
    const [linhas] = await conexao.execute('SELECT * FROM materiais WHERE id = ?', [req.params.id]);
    const m = linhas[0];
    if (!m) return res.redirect('/materiais');

    await conexao.execute(
        'INSERT INTO acessos (usuario_id, material_id) VALUES (?, ?)',
        [req.session.usuario.id, m.id]
    );
    res.render('pagMaterial', { layout: 'painel', titulo: m.titulo, ativoMateriais: true, m, ehPdf: m.tipo === 'pdf' });
});

//Entrega o arquivo só para quem logou
app.get('/arquivo/:nome', exigirLogin, (req, res) => {
    res.sendFile(req.params.nome, { root: path.join(__dirname, 'uploads') });
});

// MEU PERFIL

app.get('/perfil', exigirLogin, async (req, res) => {
    const [linhas] = await conexao.execute(
        'SELECT nome, celular, email, subregiao, diocese, tlc FROM usuarios WHERE id = ?',
        [req.session.usuario.id]
    );
    const perfil = linhas[0];
    const erros = {
        email: 'Este e-mail já está em uso.',
        celular: 'Digite um celular válido (DDD + 9 dígitos).'
    };
    res.render('pagPerfil', {
        layout: 'painel', titulo: 'Meu perfil', ativoPerfil: true,
        perfil,
        opcoesSubregiao: SUBREGIOES.map(s => ({ valor: s, marcada: s === perfil.subregiao })),
        salvo: req.query.salvo,
        erro: erros[req.query.erro]
    });
});

app.post('/perfil', exigirLogin, async (req, res) => {
    const { nome, celular, subregiao, diocese, tlc } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();

    if (celular.replace(/\D/g, '').length !== 11) {
        return res.redirect('/perfil?erro=celular');
    }

    try {
        await conexao.execute(
            'UPDATE usuarios SET nome = ?, celular = ?, email = ?, subregiao = ?, diocese = ?, tlc = ? WHERE id = ?',
            [nome.trim(), celular.trim(), email, subregiao, diocese.trim(), tlc.trim(), req.session.usuario.id]
        );
        req.session.usuario.nome = nome.trim();   // atualiza o nome do topo
        res.redirect('/perfil?salvo=1');
    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') return res.redirect('/perfil?erro=email');
        throw erro;
    }
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
