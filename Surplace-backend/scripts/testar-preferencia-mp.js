
require("dotenv").config();

const crypto = require("node:crypto");

async function testarPreferencia() {
  const token = process.env.MP_TEST_ACCESS_TOKEN;

  if (!token) {
    console.error(
      "MP_TEST_ACCESS_TOKEN não configurado."
    );
    process.exitCode = 1;
    return;
  }

  const preferencia = {
    items: [
      {
        id: "surfplace-teste-001",
        title: "Produto de Teste Surfplace",
        quantity: 1,
        currency_id: "BRL",
        unit_price: 10
      }
    ],

    external_reference:
      `surfplace-sandbox-${crypto.randomUUID()}`
  };

  try {
    const resposta = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(preferencia),
        signal: AbortSignal.timeout(15000)
      }
    );

    const dados = await resposta.json();

    console.log("HTTP:", resposta.status);

    if (!resposta.ok) {
      console.error("Erro Mercado Pago:", {
        message: dados.message,
        error: dados.error,
        status: dados.status,
        cause: dados.cause
      });

      process.exitCode = 1;
      return;
    }

    console.log({
      sucesso: true,
      preferenciaId: dados.id,
      collectorId: dados.collector_id,
      urlPagamento: dados.init_point || null,
      urlSandbox: dados.sandbox_init_point || null
    });

  } catch (erro) {
    console.error(
      "Erro na comunicação:",
      erro.message
    );
    process.exitCode = 1;
  }
}

testarPreferencia();
