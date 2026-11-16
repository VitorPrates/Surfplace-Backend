
const express = require("express");
const mongoose = require("mongoose");
const {
  MercadoPagoConfig,
  Preference
} = require("mercadopago");

const Produto = require("../models/Produto");
const Pedido = require("../models/Pedido");

const router = express.Router();

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

const preference = new Preference(client);

router.post("/criar-preferencia", async (req, res) => {
  try {
    const { produtoId, quantidade, lojaId } = req.body;

    if (
      !mongoose.isObjectIdOrHexString(produtoId) ||
      !mongoose.isObjectIdOrHexString(lojaId) ||
      !Number.isSafeInteger(quantidade) ||
      quantidade < 1
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Dados da compra inválidos."
      });
    }

    // Busca o produto no banco, não confia no
    // preço ou no estoque enviados pelo navegador.
    const produto = await Produto.findOne({
      _id: produtoId,
      loja: lojaId
    });

    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Produto não encontrado."
      });
    }

    if (produto.quantidade < quantidade) {
      return res.status(409).json({
        sucesso: false,
        mensagem: "Estoque insuficiente."
      });
    }

    const totalCentavos =
      produto.precoCentavos * quantidade;

    if (
      !Number.isSafeInteger(totalCentavos) ||
      totalCentavos <= 0
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Valor da compra inválido."
      });
    }

    // Cria o pedido no Surfplace.
    const pedido = await Pedido.create({
      loja: lojaId,
      itens: [{
        produto: produto._id,
        nome: produto.nome,
        quantidade,
        precoUnitarioCentavos: produto.precoCentavos
      }],
      totalCentavos
    });

    try {
      const configuracao = {
        items: [{
          id: String(produto._id),
          title: produto.nome,
          quantity: quantidade,
          currency_id: "BRL",
          unit_price: produto.precoCentavos / 100
        }],

        external_reference: String(pedido._id)
      };

      // URLs de retorno precisam ser públicas
      // e não devem apontar para localhost.
      const frontendPublico =
        process.env.FRONTEND_PUBLIC_URL;

      if (frontendPublico?.startsWith("https://")) {
        const base = frontendPublico.replace(/\/$/, "");

        configuracao.back_urls = {
          success: `${base}/pagamento/sucesso`,
          pending: `${base}/pagamento/pendente`,
          failure: `${base}/pagamento/falha`
        };

        configuracao.auto_return = "approved";
      }

      const resultado = await preference.create({
        body: configuracao
      });

      if (!resultado.init_point) {
        throw new Error(
          "O Mercado Pago não retornou a URL de pagamento."
        );
      }

      pedido.preferenciaId = resultado.id;
      await pedido.save();

      return res.status(201).json({
        sucesso: true,
        pedidoId: pedido._id,
        urlPagamento: resultado.init_point
      });

    } catch (erro) {
      // Se a preferência foi criada, mas o save
      // falhou, este pedido precisará de conciliação.
      console.error("Erro na preferência:", erro);

      return res.status(502).json({
        sucesso: false,
        mensagem: "Não foi possível iniciar o pagamento."
      });
    }

  } catch (erro) {
    console.error("Erro no checkout:", erro);

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno no checkout."
    });
  }
});

module.exports = router;
