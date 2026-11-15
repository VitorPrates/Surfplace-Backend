
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const mongoose = require("mongoose");
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
    fields: 6,
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
        const { nome, preco, descricao, quantidade, tags } = req.body;
        const precoCentavos = converterPreco(preco);
        const tagsConvertidas = converterTags(tags);
        const quantidadeConvertida =
        typeof quantidade === "string" &&
        /^\d+$/.test(quantidade.trim())
            ? Number(quantidade.trim())
            : NaN;

        if (
        !Number.isSafeInteger(quantidadeConvertida) ||
        quantidadeConvertida < 0
        ) {
        await limparArquivos(req.files);

        return res.status(400).json({
            sucesso: false,
            mensagem: "A quantidade deve ser um número inteiro maior ou igual a zero"
        });
        }
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
        quantidade: quantidadeConvertida,
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


router.get("/", async (req, res) => {
  try {
    const produtos = await Produto.find()
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      sucesso: true,
      produtos
    });

  } catch (erro) {
    console.error("Erro ao buscar produtos:", erro);

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao buscar produtos"
    });
  }
});


router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Verifica se o ID é válido
    if (!mongoose.isObjectIdOrHexString(id)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "ID do produto inválido"
      });
    }

    // Busca o produto no MongoDB
    const produto = await Produto.findById(id);

    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Produto não encontrado"
      });
    }

    // Exclui o produto do banco
    await Produto.findByIdAndDelete(id);

    // Remove as imagens do servidor
    const resultados = await Promise.allSettled(
      produto.fotos.map(async (foto) => {
        const nomeArquivo = path.basename(foto);

        const caminho = path.join(
          pastaUploads,
          nomeArquivo
        );

        await fs.unlink(caminho);
      })
    );

    // Registra falhas de remoção de imagens
    const falhas = resultados.filter(
      (resultado) => resultado.status === "rejected"
    );

    if (falhas.length > 0) {
      console.error(
        "Algumas imagens não foram removidas:",
        falhas
      );
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: "Produto excluído com sucesso"
    });

  } catch (erro) {
    console.error("Erro ao excluir produto:", erro);

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno ao excluir produto"
    });
  }
});



router.put("/:id", (req, res) => {
  upload.array("fotos", 5)(req, res, async (erroUpload) => {

    if (erroUpload) {
      await limparArquivos(req.files);

      return res.status(400).json({
        sucesso: false,
        mensagem: erroUpload.message
      });
    }

    try {
      const { id } = req.params;

      if (!mongoose.isObjectIdOrHexString(id)) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "ID inválido"
        });
      }

      const produto = await Produto.findById(id);

      if (!produto) {
        await limparArquivos(req.files);

        return res.status(404).json({
          sucesso: false,
          mensagem: "Produto não encontrado"
        });
      }

      const {
        nome,
        preco,
        descricao,
        quantidade,
        tags,
        fotosMantidas
      } = req.body;

      const precoCentavos = converterPreco(preco);
      const tagsConvertidas = converterTags(tags);

      const quantidadeConvertida =
        typeof quantidade === "string" &&
        /^\d+$/.test(quantidade.trim())
          ? Number(quantidade.trim())
          : NaN;

      // Validar dados do produto
      if (
        typeof nome !== "string" ||
        !nome.trim() ||
        nome.trim().length > 60
      ) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Nome inválido"
        });
      }

      if (precoCentavos === null) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Preço inválido"
        });
      }

      if (
        !Number.isSafeInteger(quantidadeConvertida) ||
        quantidadeConvertida < 0
      ) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Quantidade inválida"
        });
      }

      if (
        typeof descricao !== "string" ||
        !descricao.trim()
      ) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Descrição obrigatória"
        });
      }

      if (tagsConvertidas === null) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Tags inválidas"
        });
      }

      // Receber lista de fotos que serão mantidas
      let fotosExistentes;

      try {
        fotosExistentes = JSON.parse(fotosMantidas);
      } catch {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Lista de fotos mantidas inválida"
        });
      }

      if (
        !Array.isArray(fotosExistentes) ||
        !fotosExistentes.every(
          (foto) => typeof foto === "string"
        )
      ) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Formato das fotos inválido"
        });
      }

      // Somente fotos pertencentes ao produto
      const fotosOriginais = produto.fotos || [];

      const fotosAutorizadas = new Set(fotosOriginais);

      const fotosValidas =
        fotosExistentes.every(
          (foto) => fotosAutorizadas.has(foto)
        ) &&
        new Set(fotosExistentes).size ===
          fotosExistentes.length;

      if (!fotosValidas) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Uma ou mais fotos não pertencem ao produto"
        });
      }

      const novasFotos = (req.files || []).map(
        (arquivo) => `/uploads/produtos/${arquivo.filename}`
      );

      const fotosAtualizadas = [
        ...fotosExistentes,
        ...novasFotos
      ];

      if (fotosAtualizadas.length > 5) {
        await limparArquivos(req.files);

        return res.status(400).json({
          sucesso: false,
          mensagem: "Máximo de 5 fotos por produto"
        });
      }

      // Identificar imagens removidas
      const fotosRemovidas = fotosOriginais.filter(
        (foto) => !fotosExistentes.includes(foto)
      );

      // Atualizar dados do produto
      produto.nome = nome.trim();
      produto.precoCentavos = precoCentavos;
      produto.quantidade = quantidadeConvertida;
      produto.descricao = descricao.trim();
      produto.tags = tagsConvertidas;
      produto.fotos = fotosAtualizadas;

      await produto.save();

      // Somente após salvar, remover fotos antigas
      const resultados = await Promise.allSettled(
        fotosRemovidas.map((foto) => {
          const nomeArquivo = path.basename(foto);
          const caminho = path.join(
            pastaUploads,
            nomeArquivo
          );

          return fs.unlink(caminho);
        })
      );

      const falhas = resultados.filter(
        (resultado) => resultado.status === "rejected"
      );

      if (falhas.length > 0) {
        console.error(
          "Falha ao remover algumas fotos antigas:",
          falhas
        );
      }

      return res.status(200).json({
        sucesso: true,
        mensagem: "Produto atualizado com sucesso",
        produto
      });

    } catch (erro) {
      await limparArquivos(req.files);

      console.error("Erro ao editar produto:", erro);

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
        mensagem: "Erro interno ao editar produto"
      });
    }
  });
});

module.exports = router;
