
const express = require("express");
const Loja = require("../models/Loja");
const exigirLogin = require("../middlewares/exigirLogin");

const router = express.Router();

router.use(exigirLogin);

// Retorna a loja do usuário autenticado
router.get("/minha", async (req, res) => {
  try {
    const loja = await Loja.findOne({
      proprietario: req.session.usuarioLogado.id
    }).lean();

    return res.json({
      sucesso: true,
      loja: loja || null
    });

  } catch (erro) {
    console.error("Erro ao buscar loja:", erro);

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao buscar loja."
    });
  }
});

// Criar loja
router.post("/", async (req, res) => {
  try {
    const { nome, cnpj, descricao = "" } = req.body;

    if (
      typeof nome !== "string" ||
      typeof cnpj !== "string" ||
      typeof descricao !== "string"
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Dados inválidos."
      });
    }

    const nomeLimpo = nome.trim();
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const descricaoLimpa = descricao.trim();

    if (!nomeLimpo || nomeLimpo.length > 80) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe o nome da loja (até 80 caracteres)."
      });
    }

    if (!/^\d{14}$/.test(cnpjLimpo)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O CNPJ deve conter 14 dígitos."
      });
    }

    if (descricaoLimpa.length > 1000) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Descrição muito longa."
      });
    }

    const proprietario = req.session.usuarioLogado.id;

    const existente = await Loja.findOne({ proprietario });

    if (existente) {
      return res.status(409).json({
        sucesso: false,
        mensagem: "Você já possui uma loja cadastrada."
      });
    }

    const loja = await Loja.create({
      proprietario,
      nome: nomeLimpo,
      cnpj: cnpjLimpo,
      descricao: descricaoLimpa
    });

    return res.status(201).json({
      sucesso: true,
      mensagem: "Loja criada com sucesso!",
      loja
    });

  } catch (erro) {
    if (erro.code === 11000) {
      return res.status(409).json({
        sucesso: false,
        mensagem: "Você já possui uma loja cadastrada."
      });
    }

    console.error("Erro ao criar loja:", erro);

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno ao criar loja."
    });
  }
});

module.exports = router;
