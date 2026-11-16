
const express = require("express");
const bcrypt = require("bcrypt");
const Usuario = require("../models/User");

const router = express.Router();

function usuarioPublico(usuario) {
  return {
    id: String(usuario._id),
    nome: usuario.nome,
    sobrenome: usuario.sobrenome,
    email: usuario.email
  };
}

// CADASTRO
router.post("/cadastro", async (req, res) => {
  try {
    const { nome, sobrenome, email, telefone, senha } = req.body;

    if (
      typeof nome !== "string" ||
      typeof sobrenome !== "string" ||
      typeof email !== "string" ||
      typeof telefone !== "string" ||
      typeof senha !== "string"
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Preencha todos os campos."
      });
    }

    const nomeLimpo = nome.trim();
    const sobrenomeLimpo = sobrenome.trim();
    const emailLimpo = email.trim().toLowerCase();
    const telefoneLimpo = telefone.replace(/\D/g, "");

    if (
      !nomeLimpo ||
      !sobrenomeLimpo ||
      nomeLimpo.length > 60 ||
      sobrenomeLimpo.length > 60 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo) ||
      emailLimpo.length > 254 ||
      !/^\d{10,11}$/.test(telefoneLimpo) ||
      senha.length < 8 ||
      Buffer.byteLength(senha, "utf8") > 72
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Verifique os dados informados."
      });
    }

    const usuarioExistente = await Usuario.findOne({
      email: emailLimpo
    });

    if (usuarioExistente) {
      return res.status(409).json({
        sucesso: false,
        mensagem: "Este e-mail já está cadastrado."
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const usuario = await Usuario.create({
      nome: nomeLimpo,
      sobrenome: sobrenomeLimpo,
      email: emailLimpo,
      telefone: telefoneLimpo,
      senhaHash
    });

    return res.status(201).json({
      sucesso: true,
      mensagem: "Cadastro realizado com sucesso.",
      usuario: usuarioPublico(usuario)
    });

  } catch (erro) {
    if (erro.code === 11000) {
      return res.status(409).json({
        sucesso: false,
        mensagem: "Este e-mail já está cadastrado."
      });
    }

    console.error("Erro no cadastro:", erro);

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno ao cadastrar usuário."
    });
  }
});

// LOGIN
router.post("/login", async (req, res, next) => {
  try {
    const { email, senha } = req.body;

    if (
      typeof email !== "string" ||
      typeof senha !== "string"
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe e-mail e senha."
      });
    }

    const usuario = await Usuario.findOne({
      email: email.trim().toLowerCase()
    }).select("+senhaHash");

    const senhaCorreta = usuario
      ? await bcrypt.compare(senha, usuario.senhaHash)
      : false;

    if (!senhaCorreta) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "E-mail ou senha incorretos."
      });
    }

    // Renova o ID da sessão após autenticar
    req.session.regenerate((erro) => {
      if (erro) return next(erro);

      req.session.usuarioLogado = {
        id: String(usuario._id)
      };

      req.session.save((erro) => {
        if (erro) return next(erro);

        return res.json({
          sucesso: true,
          mensagem: "Login realizado com sucesso.",
          usuario: usuarioPublico(usuario)
        });
      });
    });

  } catch (erro) {
    next(erro);
  }
});

// VERIFICAR SESSÃO
router.get("/usuario", async (req, res, next) => {
  try {
    const id = req.session.usuarioLogado?.id;

    if (!id) {
      return res.json({
        logado: false,
        usuario: null
      });
    }

    const usuario = await Usuario.findById(id);

    if (!usuario) {
      return res.json({
        logado: false,
        usuario: null
      });
    }

    return res.json({
      logado: true,
      usuario: usuarioPublico(usuario)
    });

  } catch (erro) {
    next(erro);
  }
});

// LOGOUT
router.post("/logout", (req, res, next) => {
  req.session.destroy((erro) => {
    if (erro) return next(erro);

    res.clearCookie("connect.sid", {
      path: "/"
    });

    return res.json({
      sucesso: true,
      mensagem: "Logout realizado com sucesso."
    });
  });
});

module.exports = router;