
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const { randomUUID } = require("crypto");
const Produto = require("../models/Produto");

const router = express.Router();

const pastaUploads = path.join(
  __dirname,
  "../uploads/produtos"
);

const tiposPermitidos = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

// Configuração de armazenamento
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(pastaUploads, { recursive: true });
      cb(null, pastaUploads);
    } catch (erro) {
      cb(erro);
    }
  },

  filename: (req, file, cb) => {
    const extensao = tiposPermitidos[file.mimetype];
    cb(null, `${randomUUID()}${extensao}`);
  }
});

// Configuração do upload
const upload = multer({
  storage,

  limits: {
    files: 5,
    fileSize: 5 * 1024 * 1024,
    fields: 4,
    fieldSize: 64 * 1024
  },

  fileFilter: (req, file, cb) => {
    if (!tiposPermitidos[file.mimetype]) {
      return cb(
        new Error("Formato inválido. Use JPG, PNG ou WebP.")
      );
    }

    cb(null, true);
  }
});

// Remove arquivos quando o cadastro falha
async function limparArquivos(arquivos = []) {
  await Promise.allSettled(
    arquivos.map((arquivo) => fs.unlink(arquivo.path))
  );
}

// Converte "159,90" para 15990
function converterPreco(valor) {
  if (typeof valor !== "string") return null;

  const preco = valor.trim();

  if (!/^\d+,\d{2}$/.test(preco)) {
    return null;
  }

  const [reais, centavos] = preco.split(",");

  const resultado = Number(reais) * 100 + Number(centavos);

  return Number.isSafeInteger(resultado)
    ? resultado
    : null;
}

// Converte "tag1,tag2,tag3" para array
function converterTags(valor) {
  if (typeof valor !== "string") return null;

  return [
    ...new Set(
      valor
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
}


router.post("/", (req, res) => {
    console.log("novo produto")
  upload.array("fotos", 5)(req, res, async (erroUpload) => {
    if (erroUpload) {
      await limparArquivos(req.files);

      const mensagem =
        erroUpload.code === "LIMIT_FILE_SIZE"
          ? "Cada imagem deve ter no máximo 5 MB"
          : erroUpload.code === "LIMIT_FILE_COUNT" ||
            erroUpload.code === "LIMIT_UNEXPECTED_FILE"
          ? "Envie no máximo 5 imagens no campo fotos"
          : erroUpload.message;

      return res.status(400).json({
        sucesso: false,
        mensagem
      });
    }

    try {
      const { nome, preco, descricao, tags } = req.body;

      const precoCentavos = converterPreco(preco);
      const tagsConvertidas = converterTags(tags);

      if (
        typeof nome !== "string" ||
        !nome.trim() ||
        nome.trim().length > 60
      ) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "O nome deve ter entre 1 e 60 caracteres"
        });
      }

      if (precoCentavos === null) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Informe o preço no formato 00,00"
        });
      }

      if (
        typeof descricao !== "string" ||
        !descricao.trim()
      ) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "A descrição é obrigatória"
        });
      }

      if (tagsConvertidas === null) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Informe as tags separadas por vírgula"
        });
      }

      const fotos = (req.files || []).map(
        (arquivo) => `/uploads/produtos/${arquivo.filename}`
      );

      const produto = await Produto.create({
        nome: nome.trim(),
        precoCentavos,
        descricao: descricao.trim(),
        tags: tagsConvertidas,
        fotos
      });

      return res.status(201).json({
        sucesso: true,
        mensagem: "Produto cadastrado com sucesso",
        produto
      });
    } catch (erro) {
      await limparArquivos(req.files);

      console.error("Erro ao cadastrar produto:", erro);

      if (erro.name === "ValidationError") {
        return res.status(400).json({
          sucesso: false,
          mensagem: "Dados inválidos",
          erros: Object.values(erro.errors).map(
            (item) => item.message
          )
        });
      }

      return res.status(500).json({
        sucesso: false,
        mensagem: "Erro interno ao cadastrar produto"
      });
    }
  });
});

module.exports = router;
