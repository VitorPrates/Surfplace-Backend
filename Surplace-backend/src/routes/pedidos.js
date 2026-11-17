
const express = require("express");
const mongoose = require("mongoose");

const Loja = require("../models/Loja");
const Pedido = require("../models/Pedido");
const exigirLogin = require("../middlewares/exigirLogin");

const router = express.Router();

// Todas as rotas exigem login.
router.use(exigirLogin);

// ===================================================
// GET /api/pedidos/minha-loja
// ===================================================
router.use((req, res, next) => {
  if (req.method !== "PATCH") {
    return next();
  }

  const origem = req.get("origin");

  const origemPermitida = new URL(
    process.env.FRONTEND_URL
  ).origin;

  if (origem !== origemPermitida) {
    return res.status(403).json({
      sucesso: false,
      mensagem: "Origem não autorizada."
    });
  }

  next();
});



router.get("/minha-loja", async (req, res) => {
  try {
    const usuarioId = req.session?.usuarioLogado?.id;

    if (!mongoose.isValidObjectId(usuarioId)) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Faça login para continuar."
      });
    }

    // Localizar exclusivamente a loja do vendedor.
    const loja = await Loja.findOne({
      proprietario: usuarioId
    }).select("_id nome");

    if (!loja) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Você ainda não possui uma loja."
      });
    }

    const pedidos = await Pedido.find({
      loja: loja._id
    })
      .sort({ createdAt: -1 })
      .select(
        "comprador itens totalCentavos " +
        "statusPagamento statusPedido " +
        "simulado tipoPagamento createdAt " +
        "pagoEm concluidoEm codigoRetirada"
      )
      .populate(
        "comprador",
        "nome sobrenome"
      )
      .lean();

    return res.status(200).json({
      sucesso: true,

      loja: {
        _id: loja._id,
        nome: loja.nome
      },

      total: pedidos.length,
      pedidos
    });

  } catch (erro) {
    console.error(
      "[Pedidos GET]",
      erro.message
    );

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao consultar pedidos."
    });
  }
});

// ===================================================
// PATCH /api/pedidos/:id/status
// ===================================================

router.patch("/:id/status", async (req, res) => {
  try {
    const usuarioId = req.session?.usuarioLogado?.id;
    const pedidoId = req.params.id;
    const novoStatus = req.body?.statusPedido;

    if (!mongoose.isValidObjectId(usuarioId)) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Faça login para continuar."
      });
    }

    if (!mongoose.isValidObjectId(pedidoId)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "ID do pedido inválido."
      });
    }

    // Apenas estes estados podem ser solicitados
    // pelo painel do vendedor.
    const statusAnterior = {
      em_preparacao: "pendente",
      pronto: "em_preparacao",
      concluido: "pronto"
    }[novoStatus];

    if (!statusAnterior) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Situação solicitada inválida."
      });
    }

    const loja = await Loja.findOne({
      proprietario: usuarioId
    }).select("_id");

    if (!loja) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Loja não encontrada."
      });
    }

    // Atualização atômica:
    // somente se o pedido estiver na etapa correta,
    // pertencer à loja e tiver pagamento aprovado.
    const atualizacoes = {
      statusPedido: novoStatus
    };

    if (novoStatus === "concluido") {
      atualizacoes.concluidoEm = new Date();
    }

    const pedidoAtualizado =
      await Pedido.findOneAndUpdate(
        {
          _id: pedidoId,
          loja: loja._id,
          statusPagamento: "aprovado",
          statusPedido: statusAnterior
        },
        {
          $set: atualizacoes
        },
        {
          returnDocument: "after",
          runValidators: true
        }
      )
      .select(
        "loja comprador itens totalCentavos " +
        "statusPagamento statusPedido simulado " +
        "createdAt concluidoEm"
      );

    if (!pedidoAtualizado) {
      // Não revelar dados de pedidos de outras lojas.
      const pedidoDaLoja = await Pedido.findOne({
        _id: pedidoId,
        loja: loja._id
      }).select("statusPagamento statusPedido");

      if (!pedidoDaLoja) {
        return res.status(404).json({
          sucesso: false,
          mensagem: "Pedido não encontrado."
        });
      }

      if (
        pedidoDaLoja.statusPagamento !== "aprovado"
      ) {
        return res.status(409).json({
          sucesso: false,
          mensagem:
            "O pagamento deste pedido não está aprovado."
        });
      }

      return res.status(409).json({
        sucesso: false,
        mensagem:
          "O pedido não está na etapa necessária " +
          "para essa alteração."
      });
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: "Situação atualizada com sucesso.",
      pedido: pedidoAtualizado
    });

  } catch (erro) {
    console.error(
      "[Pedidos PATCH]",
      erro.message
    );

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao atualizar o pedido."
    });
  }
});

module.exports = router;
