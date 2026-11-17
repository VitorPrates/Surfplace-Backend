
const express = require("express");
const mongoose = require("mongoose");
const {
  MercadoPagoConfig,
  Preference
} = require("mercadopago");

const Produto = require("../models/Produto");
const Pedido = require("../models/Pedido");
const Loja = require("../models/Loja")
const { descriptografar } = require("../utils/segredos");
const exigirLogin = require("../middlewares/exigirLogin");

const router = express.Router();

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

const preference = new Preference(client);

// router.post("/criar-preferencia", async (req, res) => {
//   try {
//     const { produtoId, quantidade, lojaId } = req.body;

//     if (
//       !mongoose.isObjectIdOrHexString(produtoId) ||
//       !mongoose.isObjectIdOrHexString(lojaId) ||
//       !Number.isSafeInteger(quantidade) ||
//       quantidade < 1
//     ) {
//       return res.status(400).json({
//         sucesso: false,
//         mensagem: "Dados da compra inválidos."
//       });
//     }

//     // Busca o produto no banco, não confia no
//     // preço ou no estoque enviados pelo navegador.
//     const produto = await Produto.findOne({
//       _id: produtoId,
//       loja: lojaId
//     });

//     if (!produto) {
//       return res.status(404).json({
//         sucesso: false,
//         mensagem: "Produto não encontrado."
//       });
//     }

//     if (produto.quantidade < quantidade) {
//       return res.status(409).json({
//         sucesso: false,
//         mensagem: "Estoque insuficiente."
//       });
//     }

//     const totalCentavos =
//       produto.precoCentavos * quantidade;

//     if (
//       !Number.isSafeInteger(totalCentavos) ||
//       totalCentavos <= 0
//     ) {
//       return res.status(400).json({
//         sucesso: false,
//         mensagem: "Valor da compra inválido."
//       });
//     }

//     // Cria o pedido no Surfplace.
//     const pedido = await Pedido.create({
//       loja: lojaId,
//       itens: [{
//         produto: produto._id,
//         nome: produto.nome,
//         quantidade,
//         precoUnitarioCentavos: produto.precoCentavos
//       }],
//       totalCentavos
//     });

//     try {
//       const configuracao = {
//         items: [{
//           id: String(produto._id),
//           title: produto.nome,
//           quantity: quantidade,
//           currency_id: "BRL",
//           unit_price: produto.precoCentavos / 100
//         }],

//         external_reference: String(pedido._id)
//       };

//       // URLs de retorno precisam ser públicas
//       // e não devem apontar para localhost.
//       const frontendPublico =
//         process.env.FRONTEND_PUBLIC_URL;

//       if (frontendPublico?.startsWith("https://")) {
//         const base = frontendPublico.replace(/\/$/, "");

//         configuracao.back_urls = {
//           success: `${base}/pagamento/sucesso`,
//           pending: `${base}/pagamento/pendente`,
//           failure: `${base}/pagamento/falha`
//         };

//         configuracao.auto_return = "approved";
//       }

//       const resultado = await preference.create({
//         body: configuracao
//       });

//       if (!resultado.init_point) {
//         throw new Error(
//           "O Mercado Pago não retornou a URL de pagamento."
//         );
//       }

//       pedido.preferenciaId = resultado.id;
//       await pedido.save();

//       return res.status(201).json({
//         sucesso: true,
//         pedidoId: pedido._id,
//         urlPagamento: resultado.init_point
//       });

//     } catch (erro) {
//       // Se a preferência foi criada, mas o save
//       // falhou, este pedido precisará de conciliação.
//       console.error("Erro na preferência:", erro);

//       return res.status(502).json({
//         sucesso: false,
//         mensagem: "Não foi possível iniciar o pagamento."
//       });
//     }

//   } catch (erro) {
//     console.error("Erro no checkout:", erro);

//     return res.status(500).json({
//       sucesso: false,
//       mensagem: "Erro interno no checkout."
//     });
//   }
// });

// Apenas usuários autenticados podem comprar


router.post("/criar", exigirLogin, async (req, res) => {
  try {
    const compradorId = req.session?.usuarioLogado?.id;
    const { produtoId, quantidade, chaveCheckout } = req.body;

    if (
    typeof chaveCheckout !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(chaveCheckout)
    ) {
    return res.status(400).json({
        sucesso: false,
        mensagem: "Identificador da tentativa de compra inválido."
    });
    }

    // 1. Validar comprador e dados
    if (!compradorId) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Faça login para continuar."
      });
    }

    if (
      !mongoose.isValidObjectId(produtoId) ||
      !Number.isSafeInteger(quantidade) ||
      quantidade < 1
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Produto ou quantidade inválidos."
      });
    }

    const pedidoExistente = await Pedido.findOne({
    comprador: compradorId,
    chaveCheckout
    });

    if (pedidoExistente) {
    if (pedidoExistente.mercadoPago?.preferenciaId) {
        return res.status(200).json({
        sucesso: true,
        reutilizado: true,
        pedidoId: pedidoExistente._id,
        preferenciaId:
            pedidoExistente.mercadoPago.preferenciaId,
        urlPagamento:
            pedidoExistente.mercadoPago.urlPagamento,
        totalCentavos: pedidoExistente.totalCentavos
        });
    }
    const mesmoProduto =
    String(pedidoExistente.itens[0]?.produto) ===
    String(produtoId);

    const mesmaQuantidade =
    pedidoExistente.itens[0]?.quantidade === quantidade;

    if (!mesmoProduto || !mesmaQuantidade) {
    return res.status(409).json({
        sucesso: false,
        mensagem:
        "Esta chave já foi utilizada para outra compra."
    });
    }

    return res.status(409).json({
        sucesso: false,
        mensagem:
        "Esta tentativa já foi registrada, mas ainda não possui uma preferência confirmada.",
        pedidoId: pedidoExistente._id
    });
    }

    // 2. Buscar o produto verdadeiro
    const produto = await Produto.findById(produtoId);

    if (!produto) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Produto não encontrado."
      });
    }

    if (
      !Number.isSafeInteger(produto.quantidade) ||
      produto.quantidade < quantidade
    ) {
      return res.status(409).json({
        sucesso: false,
        mensagem: "Estoque insuficiente."
      });
    }

    if (
      !Number.isSafeInteger(produto.precoCentavos) ||
      produto.precoCentavos <= 0
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Produto sem preço válido."
      });
    }

    if (!produto.loja) {
      return res.status(409).json({
        sucesso: false,
        mensagem: "Produto sem loja vinculada."
      });
    }

    // 3. Verificar a configuração pública
    const publicUrl = (
      process.env.PUBLIC_URL ||
      process.env.FRONTEND_URL ||
      ""
    ).replace(/\/$/, "");

    if (!/^https:\/\/[^/]+$/i.test(publicUrl)) {
      return res.status(503).json({
        sucesso: false,
        mensagem: "URL pública do Surfplace não configurada."
      });
    }

    // 4. Buscar a loja e seu token OAuth
    const loja = await Loja.findById(produto.loja)
      .select("+mercadoPago.accessTokenEnc");

    if (
      !loja ||
      !loja.mercadoPago?.userId ||
      !loja.mercadoPago?.accessTokenEnc
    ) {
      return res.status(409).json({
        sucesso: false,
        mensagem:
          "Esta loja não possui Mercado Pago conectado."
      });
    }

    const validade = loja.mercadoPago.expiresAt
      ? new Date(loja.mercadoPago.expiresAt).getTime()
      : NaN;

    if (!Number.isFinite(validade) ||
        validade <= Date.now() + 60000) {
      return res.status(409).json({
        sucesso: false,
        mensagem:
          "A autorização Mercado Pago da loja precisa ser renovada."
      });
    }

    const accessToken = descriptografar(
      loja.mercadoPago.accessTokenEnc
    );

    // 5. Calcular o valor no backend
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

    // 6. Preparar o pedido pendente
    const pedido = new Pedido({
        comprador: compradorId,
        chaveCheckout,
        loja: loja._id,

      itens: [
        {
          produto: produto._id,
          nome: produto.nome,
          quantidade,
          precoUnitarioCentavos: produto.precoCentavos
        }
      ],

      totalCentavos,
      statusPagamento: "aguardando",
      statusPedido: "pendente",

      mercadoPago: {
        vendedorId: String(loja.mercadoPago.userId)
      }
    });

    // Salvar antes da cobrança para criar a referência
    await pedido.save();

    // 7. Criar preferência Checkout Pro
    const preferencia = {
      items: [
        {
          id: String(produto._id),
          title: produto.nome,
          quantity: quantidade,
          currency_id: "BRL",
          unit_price: produto.precoCentavos / 100
        }
      ],

      external_reference: String(pedido._id),

      back_urls: {
        success: `${publicUrl}/pagamento/retorno`,
        failure: `${publicUrl}/pagamento/retorno`,
        pending: `${publicUrl}/pagamento/retorno`
      },

      auto_return: "approved"
    };

    const resposta = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(preferencia),
        signal: AbortSignal.timeout(15000)
      }
    );

    const dados = await resposta.json();

    if (
      !resposta.ok ||
      !dados.id ||
      !dados.init_point
    ) {
      console.error(
        "[Checkout] Falha Mercado Pago:",
        resposta.status,
        "pedido:",
        String(pedido._id)
      );

      return res.status(502).json({
        sucesso: false,
        mensagem:
          "Não foi possível iniciar o pagamento.",
        pedidoId: pedido._id
      });
    }

    // 8. Conferir a conta que receberá a cobrança
    if (
      String(dados.collector_id) !==
      String(loja.mercadoPago.userId)
    ) {
      console.error(
        "[Checkout] Conta Mercado Pago divergente:",
        String(pedido._id)
      );

      return res.status(502).json({
        sucesso: false,
        mensagem:
          "Não foi possível validar o destinatário do pagamento.",
        pedidoId: pedido._id
      });
    }

    // 9. Salvar a preferência gerada
    pedido.mercadoPago.preferenciaId = String(dados.id);
    pedido.mercadoPago.urlPagamento = dados.init_point;

    await pedido.save();

    // 10. Entregar URL ao frontend
    return res.status(201).json({
      sucesso: true,
      pedidoId: pedido._id,
      preferenciaId: dados.id,
      urlPagamento: dados.init_point,
      totalCentavos
    });

  } catch (erro) {
    if (erro.code === 11000) {
    return res.status(409).json({
        sucesso: false,
        mensagem:
        "Esta tentativa de checkout já foi registrada. Consulte o pedido existente."
    });
    }
    console.error(
      "[Checkout] Erro:",
      erro.message
    );

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao preparar o pagamento."
    });
  }
});

module.exports = router;
