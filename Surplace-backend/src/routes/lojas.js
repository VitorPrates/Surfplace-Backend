
const express = require("express");
const Loja = require("../models/Loja");
const exigirLogin = require("../middlewares/exigirLogin");
const { geocodificar } = require("../services/geocodificacao");

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


router.post("/minha/geocodificar", async (req, res) => {
  try {
    const {
      logradouro,
      numero,
      cidade,
      uf,
      cep
    } = req.body;

    if (
      typeof logradouro !== "string" ||
      typeof numero !== "string" ||
      typeof cidade !== "string" ||
      typeof uf !== "string" ||
      typeof cep !== "string" ||
      !logradouro.trim() ||
      !numero.trim() ||
      !cidade.trim() ||
      !/^[A-Za-z]{2}$/.test(uf) ||
      !/^\d{8}$/.test(cep.replace(/\D/g, ""))
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Preencha um endereço válido."
      });
    }

    const enderecoCompleto = [
      `${logradouro.trim()}, ${numero.trim()}`,
      cidade.trim(),
      uf.toUpperCase(),
      cep.replace(/\D/g, ""),
      "Brasil"
    ].join(", ");

    if (enderecoCompleto.length > 400) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Endereço muito longo."
      });
    }

    const resultado = await geocodificar(enderecoCompleto);

    return res.json({
      sucesso: true,
      localizacao: {
        latitude: resultado.latitude,
        longitude: resultado.longitude
      },
      enderecoEncontrado: resultado.descricao
    });

  } catch (erro) {
    console.error("Erro de geocodificação:", erro);

    return res.status(erro.status || 502).json({
      sucesso: false,
      mensagem: erro.status
        ? erro.message
        : "Não foi possível localizar o endereço."
    });
  }
});


router.put("/minha/endereco", async (req, res) => {
  try {
    const {
      cep,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      complemento = "",
      latitude,
      longitude
    } = req.body;

    const campos = {
      cep,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      complemento
    };

    if (
      Object.values(campos).some(
        (valor) => typeof valor !== "string"
      )
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Dados de endereço inválidos."
      });
    }

    const endereco = Object.fromEntries(
      Object.entries(campos).map(([chave, valor]) => [
        chave,
        valor.trim()
      ])
    );

    endereco.cep = endereco.cep.replace(/\D/g, "");
    endereco.uf = endereco.uf.toUpperCase();

    if (
      !/^\d{8}$/.test(endereco.cep) ||
      !/^[A-Z]{2}$/.test(endereco.uf) ||
      !endereco.logradouro ||
      !endereco.numero ||
      !endereco.cidade ||
      !endereco.bairro ||
      Object.entries(endereco).some(([campo, valor]) =>
        valor.length > (campo === "complemento" ? 60 : 200)
      )
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Confira os campos do endereço."
      });
    }

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Confirme a localização no mapa."
      });
    }

    const loja = await Loja.findOneAndUpdate(
      {
        proprietario: req.session.usuarioLogado.id
      },
      {
        $set: {
          endereco,
          localizacao: {
            type: "Point",
            coordinates: [longitude, latitude]
          }
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!loja) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Loja não encontrada."
      });
    }

    return res.json({
      sucesso: true,
      mensagem: "Endereço atualizado com sucesso.",
      loja
    });

  } catch (erro) {
    console.error("Erro ao salvar endereço:", erro);

    return res.status(
      erro.name === "ValidationError" ? 400 : 500
    ).json({
      sucesso: false,
      mensagem: "Não foi possível salvar o endereço."
    });
  }
});


module.exports = router;
