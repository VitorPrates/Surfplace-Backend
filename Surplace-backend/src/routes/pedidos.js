
const express = require("express");
const mongoose = require("mongoose");

const Loja = require("../models/Loja");
const Pedido = require("../models/Pedido");
const exigirLogin = require("../middlewares/exigirLogin");
const Produto = require("../models/Produto");

const router = express.Router();

// Todas as rotas exigem login.
router.use(exigirLogin);

// ===================================================
// GET /api/pedidos/minha-loja
// ===================================================
router.use((req, res, next) => {
    if (!["PATCH", "POST"].includes(req.method)) {
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


router.get("/meus", async (req, res) => {
  try {
    const compradorId = req.session?.usuarioLogado?.id;

    const pedidos = await Pedido.find({
      comprador: compradorId
    })
      .sort({ createdAt: -1 })
      .select(
        "loja itens totalCentavos " +
        "statusPagamento statusPedido " +
        "simulado tipoPagamento " +
        "codigoRetirada createdAt concluidoEm"
      )
      .populate("loja", "nome")
      .lean();

    const resultado = pedidos.map(pedido => {
      const podeMostrarCodigo =
        pedido.simulado === true &&
        pedido.statusPagamento === "aprovado" &&
        pedido.statusPedido === "pronto";

      return {
        ...pedido,
        codigoRetirada: podeMostrarCodigo
          ? pedido.codigoRetirada || null
          : null
      };
    });

    return res.status(200).json({
      sucesso: true,
      total: resultado.length,
      pedidos: resultado
    });

  } catch (erro) {
    console.error(
      "[Pedidos do comprador]",
      erro.message
    );

    return res.status(500).json({
      sucesso: false,
      mensagem: "Não foi possível consultar seus pedidos."
    });
  }
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


router.post(
  "/:id/confirmar-retirada",
  async (req, res) => {
    try {
      const usuarioId = req.session?.usuarioLogado?.id;
      const pedidoId = req.params.id;

      const codigo = typeof req.body?.codigo === "string"
        ? req.body.codigo.trim().toUpperCase()
        : "";

      if (
        !mongoose.isValidObjectId(pedidoId) ||
        !/^[A-F0-9]{12}$/.test(codigo)
      ) {
        return res.status(400).json({
          sucesso: false,
          mensagem: "Dados da retirada inválidos."
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
      // loja correta, pedido pronto e código correto.
      const pedido = await Pedido.findOneAndUpdate(
        {
          _id: pedidoId,
          loja: loja._id,
          simulado: true,
          tipoPagamento: "simulado",
          statusPagamento: "aprovado",
          statusPedido: "pronto",
          codigoRetirada: codigo
        },
        {
          $set: {
            statusPedido: "concluido",
            concluidoEm: new Date()
          }
        },
        {
          returnDocument: "after",
          runValidators: true
        }
      ).select(
        "_id statusPedido statusPagamento " +
        "concluidoEm simulado"
      );

      if (!pedido) {
        return res.status(409).json({
          sucesso: false,
          mensagem:
            "Não foi possível validar a retirada. " +
            "Confira o pedido, o código e sua situação."
        });
      }

      return res.status(200).json({
        sucesso: true,
        mensagem: "Retirada confirmada com sucesso.",
        pedido
      });

    } catch (erro) {
      console.error(
        "[Confirmar retirada]",
        erro.message
      );

      return res.status(500).json({
        sucesso: false,
        mensagem: "Erro ao confirmar retirada."
      });
    }
  }
);


// ===================================================
// PATCH /api/pedidos/:id/status
// ===================================================

router.patch("/:id/cancelar", async (req, res) => {
    
  const usuarioId = req.session?.usuarioLogado?.id;
  const pedidoId = req.params.id;


  
  if (!mongoose.isValidObjectId(pedidoId)) {
    return res.status(400).json({
      sucesso: false,
      mensagem: "ID do pedido inválido."
    });
  }

  const session = await mongoose.startSession();

  try {
    let resultado;

    await session.withTransaction(async () => {
      const pedido = await Pedido.findById(pedidoId)
        .session(session);

      if (!pedido) {
        const erro = new Error("Pedido não encontrado.");
        erro.statusHTTP = 404;
        throw erro;
      }

      const loja = await Loja.findById(pedido.loja)
        .select("proprietario")
        .session(session);

      const comprador =
        String(pedido.comprador) === String(usuarioId);

      const vendedor =
        loja &&
        String(loja.proprietario) === String(usuarioId);

      if (!comprador && !vendedor) {
        const erro = new Error("Pedido não encontrado.");
        erro.statusHTTP = 404;
        throw erro;
      }

      // Não permitir cancelamento local
      // de transações reais do Mercado Pago.
      console.log("[Cancelar pedido] Diagnóstico:", {
        pedidoId: String(pedido._id),
        tipoPagamento: pedido.tipoPagamento,
        simulado: pedido.simulado,
        statusPagamento: pedido.statusPagamento,
        statusPedido: pedido.statusPedido
        });
      if (
        pedido.simulado !== true ||
        pedido.tipoPagamento !== "simulado"
      ) {
        const erro = new Error(
          "Este pedido não permite cancelamento demonstrativo."
        );
        erro.statusHTTP = 409;
        throw erro;
      }

      // Repetição de cancelamento: não devolver
      // estoque novamente.
      if (pedido.statusPedido === "cancelado") {
        resultado = {
          sucesso: true,
          reutilizado: true,
          pedidoId: pedido._id,
          statusPedido: "cancelado",
          statusPagamento: pedido.statusPagamento
        };
        return;
      }

      const estadosPermitidos = vendedor
        ? ["pendente", "em_preparacao"]
        : ["pendente"];

      if (
        pedido.statusPagamento !== "aprovado" ||
        !estadosPermitidos.includes(pedido.statusPedido)
      ) {
        const erro = new Error(
          "Este pedido não pode mais ser cancelado."
        );
        erro.statusHTTP = 409;
        throw erro;
      }

      const statusAnterior = pedido.statusPedido;

      const alteracao = await Pedido.updateOne(
        {
          _id: pedido._id,
          statusPedido: statusAnterior,
          statusPagamento: "aprovado",
          simulado: true
        },
        {
          $set: {
            statusPedido: "cancelado",
            statusPagamento: "cancelado"
          }
        },
        { session }
      );

      if (alteracao.modifiedCount !== 1) {
        const erro = new Error(
          "O pedido foi alterado durante o cancelamento."
        );
        erro.statusHTTP = 409;
        throw erro;
      }

      // Devolver todos os itens ao estoque
      // dentro da mesma transação.
      for (const item of pedido.itens) {
        const estoque = await Produto.updateOne(
          {
            _id: item.produto,
            loja: pedido.loja
          },
          {
            $inc: {
              quantidade: item.quantidade
            }
          },
          { session }
        );

        if (estoque.matchedCount !== 1) {
          const erro = new Error(
            "Não foi possível restaurar o estoque."
          );
          erro.statusHTTP = 409;
          throw erro;
        }
      }

      resultado = {
        sucesso: true,
        reutilizado: false,
        mensagem: "Pedido cancelado com sucesso.",
        pedidoId: pedido._id,
        statusPedido: "cancelado",
        statusPagamento: "cancelado"
      };
    });

    return res.status(200).json(resultado);

  } catch (erro) {
    console.error(
      "[Cancelar pedido]",
      erro.message
    );

    return res.status(erro.statusHTTP || 500).json({
      sucesso: false,
      mensagem: erro.statusHTTP
        ? erro.message
        : "Não foi possível cancelar o pedido."
    });

  } finally {
    await session.endSession();
  }
});

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
    pronto: "em_preparacao"
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
