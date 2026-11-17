
const express = require("express");
const mongoose = require("mongoose");

const Produto = require("../models/Produto");
const Pedido = require("../models/Pedido");
const exigirLogin = require("../middlewares/exigirLogin");

const router = express.Router();

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A simulação nunca deve funcionar em produção.
router.use((req, res, next) => {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.CHECKOUT_DEMO_MODE !== "true"
  ) {
    return res.status(404).json({
      sucesso: false,
      mensagem: "Simulação indisponível."
    });
  }

  next();
});

router.post("/simular", exigirLogin, async (req, res) => {
  const compradorId = req.session?.usuarioLogado?.id;
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
  const {
    produtoId,
    quantidade,
    chaveCheckout
  } = req.body || {};

  // 1. Validar dados
  if (
    !mongoose.isValidObjectId(compradorId) ||
    !mongoose.isValidObjectId(produtoId) ||
    !Number.isSafeInteger(quantidade) ||
    quantidade < 1 ||
    typeof chaveCheckout !== "string" ||
    !uuidRegex.test(chaveCheckout)
  ) {
    return res.status(400).json({
      sucesso: false,
      mensagem: "Dados da compra inválidos."
    });
  }

  // 2. Consultar tentativa anterior
  async function buscarTentativa() {
    const existente = await Pedido.findOne({
      comprador: compradorId,
      chaveCheckout
    });

    if (!existente) return null;

    const mesmoProduto =
      existente.itens.length === 1 &&
      String(existente.itens[0].produto) ===
        String(produtoId);

    const mesmaQuantidade =
      existente.itens[0]?.quantidade === quantidade;

    if (
      !mesmoProduto ||
      !mesmaQuantidade ||
      !existente.simulado
    ) {
      return {
        erro: true,
        mensagem:
          "Esta chave já foi utilizada em outra compra."
      };
    }

    return {
      sucesso: true,
      reutilizado: true,
      pedidoId: existente._id,
      totalCentavos: existente.totalCentavos,
      statusPagamento: existente.statusPagamento,
      statusPedido: existente.statusPedido,
      simulado: true
    };
  }

  try {
    const anterior = await buscarTentativa();

    if (anterior) {
      return res.status(anterior.erro ? 409 : 200)
        .json(anterior);
    }

    // 3. Iniciar transação MongoDB
    const session = await mongoose.startSession();

    let pedidoCriado;

    try {
      await session.withTransaction(async () => {
        const produto = await Produto.findById(
          produtoId
        ).session(session);

        if (!produto) {
          const erro = new Error(
            "Produto não encontrado."
          );
          erro.statusHTTP = 404;
          throw erro;
        }

        if (!produto.loja) {
          const erro = new Error(
            "Produto sem loja vinculada."
          );
          erro.statusHTTP = 409;
          throw erro;
        }

        if (
          !Number.isSafeInteger(produto.precoCentavos) ||
          produto.precoCentavos <= 0
        ) {
          const erro = new Error(
            "Preço do produto inválido."
          );
          erro.statusHTTP = 400;
          throw erro;
        }

        const totalCentavos =
          produto.precoCentavos * quantidade;

        if (
          !Number.isSafeInteger(totalCentavos) ||
          totalCentavos <= 0
        ) {
          const erro = new Error(
            "Valor da compra inválido."
          );
          erro.statusHTTP = 400;
          throw erro;
        }

        // 4. Descontar estoque somente
        // se houver quantidade suficiente.
        const atualizado = await Produto.updateOne(
          {
            _id: produto._id,
            quantidade: { $gte: quantidade }
          },
          {
            $inc: { quantidade: -quantidade }
          },
          { session }
        );

        if (atualizado.modifiedCount !== 1) {
          const erro = new Error(
            "Estoque insuficiente."
          );
          erro.statusHTTP = 409;
          throw erro;
        }

        // 5. Criar pedido de demonstração
        const [pedido] = await Pedido.create(
          [{
            comprador: compradorId,
            loja: produto.loja,
            chaveCheckout,

            itens: [{
              produto: produto._id,
              nome: produto.nome,
              quantidade,
              precoUnitarioCentavos:
                produto.precoCentavos
            }],

            totalCentavos,

            tipoPagamento: "simulado",
            simulado: true,

            statusPagamento: "aprovado",
            statusPedido: "pendente",

            pagoEm: new Date()
          }],
          { session }
        );

        pedidoCriado = pedido;
      });
    } finally {
      await session.endSession();
    }

    // Só responder como aprovado após
    // a transação ser confirmada.
    return res.status(201).json({
      sucesso: true,
      reutilizado: false,
      mensagem:
        "Compra simulada realizada com sucesso!",
      pedidoId: pedidoCriado._id,
      totalCentavos: pedidoCriado.totalCentavos,
      statusPagamento:
        pedidoCriado.statusPagamento,
      statusPedido: pedidoCriado.statusPedido,
      simulado: true
    });

  } catch (erro) {
    // Outra requisição pode ter criado
    // este mesmo pedido simultaneamente.
    if (erro.code === 11000) {
      const anterior = await buscarTentativa();

      if (anterior) {
        return res
          .status(anterior.erro ? 409 : 200)
          .json(anterior);
      }
    }

    console.error(
      "[Checkout Demo]",
      erro.message
    );

    const status = erro.statusHTTP || 500;

    return res.status(status).json({
      sucesso: false,
      mensagem: erro.statusHTTP
        ? erro.message
        : "Não foi possível concluir a simulação."
    });
  }
});

module.exports = router;
