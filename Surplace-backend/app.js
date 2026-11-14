
const express = require("express");
const bcrypt = require('bcrypt');
const path = require("path");
const session = require('express-session');
const cors = require("cors");
const app = express();

const produtosRoutes = require("./src/routes/produtos");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname + '/public'));


// 1. Configuração do Middleware de Sessão
app.use(session({
  secret: 'seu_segredo_super_seguro', // Chave para criptografar o cookie
  resave: false,                      // Não salva a sessão se ela não foi modificada
  saveUninitialized: false,           // Não cria sessão para usuários não logados
  cookie: { 
    secure: false,                    // Defina como true se usar HTTPS
    maxAge: 90000                    // Tempo de expiração em milissegundos (ex: 10 minutos)
  }
}));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

app.use("/api/produtos", produtosRoutes);
app.use("/surfplace2", produtosRoutes);

app.post("/cadastro", async (req, res) => {
    const nome = req.body.nome
    const sobrenome = req.body.sobrenome
    const email = req.body.email
    const senha = req.body.senha
    const telefone = req.body.senha
    try {
        const emailNormalizado = email.trim().toLowerCase();
        const senhaHash = await bcrypt.hash(senha, 10);
        await Usuario.create({
        nome, sobrenome, email: emailNormalizado, telefone, senhaHash
        });
        res.json({msg:"User criado!"})
    } catch (error) {
        console.error(error);
        res.status(500).send("Erro interno.");
    }
});

app.post("/login",async (req, res) => {
    const email = req.body.email
    const senha = req.body.senha
    console.log(email,senha);
    try {
        const usuario = await Usuario.findOne({
            email: email.trim().toLowerCase()
        }).select("+senhaHash");

        const senhaCorreta = usuario &&
        await bcrypt.compare(senha, usuario.senhaHash);
        if (!senhaCorreta) {
        // Responda 401: e-mail ou senha incorretos.
        //
            res.status(401).json({msg:"Email ou senha incorretos."});
        }
        req.session.usuarioLogado = {_id: usuario._id, username: usuario.nome, role: 'Comprador' };
        res.json({sucesso:true, user: "user", redirectUrl: "/"})
    } catch (error) {
        console.log(error)
        res.status(401).json({msg:"Email ou senha incorretos."});
    }
    
});


app.get("/surfplace", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/ola.html"));
});

// app.get("/", (req, res) => {
//   res.sendFile(path.join(__dirname, "./public/index.html"));
// });



//verificar se o usuário está logado
app.get("/api/usuario", (req, res) => {
  // Verifica se o usuário está logado na sessão
  console.log("new arrempt");
  
  if (req.session && req.session.usuarioLogado) {
    return res.json({ 
      logado: true, 
      username: req.session.usuarioLogado.username 
    });
  }
  // Se não estiver logado
  return res.json({ logado: false });
});

module.exports = app;