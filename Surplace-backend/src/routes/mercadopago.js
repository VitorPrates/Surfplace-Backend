
const express = require("express");
const crypto = require("crypto");

const Loja = require("../models/Loja");
const exigirLogin = require("../middlewares/exigirLogin");
const { criptografar } = require("../utils/segredos");

const router = express.Router();

// Iniciar conexão
router.get("/conectar", exigirLogin, async (req, res, next) => {
    console.log("[OAuth conectar]", {
  usuarioAutenticado: Boolean(
    req.session?.usuarioLogado?.id
  ),
  clientIdConfigurado: Boolean(
    process.env.MP_CLIENT_ID
  ),
  redirectConfigurado: Boolean(
    process.env.MP_REDIRECT_URI
  )
});
  try {
    const loja = await Loja.findOne({
      proprietario: req.session.usuarioLogado.id
    });

    if (!loja) {
      return res.status(403).json({
        sucesso: false,
        mensagem: "Cadastre uma loja primeiro."
      });
    }

    const state = crypto.randomBytes(32).toString("hex");

    req.session.mpOAuth = {
      state,
      lojaId: String(loja._id),
      criadoEm: Date.now()
    };

    req.session.save((erro) => {
      if (erro) return next(erro);

      const url = new URL(
        "https://auth.mercadopago.com/authorization"
      );

      url.searchParams.set(
        "client_id",
        process.env.MP_CLIENT_ID
      );
      url.searchParams.set("response_type", "code");
      url.searchParams.set("platform_id", "mp");
      url.searchParams.set("state", state);
      url.searchParams.set(
        "redirect_uri",
        process.env.MP_REDIRECT_URI
      );

      return res.redirect(url.toString());
    });

  } catch (erro) {
    next(erro);
  }
});


// Receber autorização
router.get("/callback", exigirLogin, async (req, res, next) => {
    console.log("Callback Mercado Pago:", {
    codigoRecebido: typeof req.query.code === "string",
    stateRecebido: typeof req.query.state === "string",
    sessaoAtiva: Boolean(req.session?.usuarioLogado?.id),
    tentativaOAuth: Boolean(req.session?.mpOAuth),
    erroAutorizacao: req.query.error || null
    });
  try {
    const { code, state } = req.query;
    const tentativa = req.session.mpOAuth;

    if (
      typeof code !== "string" ||
      typeof state !== "string" ||
      !tentativa ||
      state !== tentativa.state ||
      Date.now() - tentativa.criadoEm > 10 * 60 * 1000
    ) {
      return res.status(400).send(
        "Autorização inválida ou expirada."
      );
    }

    delete req.session.mpOAuth;

    const loja = await Loja.findOne({
      _id: tentativa.lojaId,
      proprietario: req.session.usuarioLogado.id
    });

    if (!loja) {
      return res.status(403).send(
        "Loja não autorizada."
      );
    }

    const resposta = await fetch(
      "https://api.mercadopago.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: new URLSearchParams({
          client_id: process.env.MP_CLIENT_ID,
          client_secret: process.env.MP_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.MP_REDIRECT_URI
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    const dados = await resposta.json();

    if (
      !resposta.ok ||
      !dados.access_token ||
      !dados.refresh_token ||
      !dados.user_id
    ) {
      return res.status(502).send(
        "Falha ao conectar a conta Mercado Pago."
      );
    }

    // Não permitir que duas lojas Surfplace
    // utilizem a mesma conta MP nesta versão.
    const outraLoja = await Loja.findOne({
      "mercadoPago.userId": String(dados.user_id),
      _id: { $ne: loja._id }
    });

    if (outraLoja) {
      return res.status(409).send(
        "Esta conta Mercado Pago já está vinculada a outra loja."
      );
    }

    loja.mercadoPago = {
      userId: String(dados.user_id),
      accessTokenEnc: criptografar(dados.access_token),
      refreshTokenEnc: criptografar(dados.refresh_token),
      expiresAt: new Date(
        Date.now() + dados.expires_in * 1000
      ),
      conectadoEm: new Date()
    };

    await loja.save();

    return res.redirect(
      `${process.env.FRONTEND_URL}/vendedor/configs?mp=conectado`
    );

  } catch (erro) {
    next(erro);
  }
});


router.get("/testar-conexao", exigirLogin, async (req, res) => {
  try {
    // 1. Buscar a loja do usuário autenticado
    const loja = await Loja.findOne({
      proprietario: req.session.usuarioLogado.id
    }).select("+mercadoPago.accessTokenEnc");

    if (!loja) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Loja não encontrada."
      });
    }

    // 2. Verificar se a loja possui credenciais
    if (
      !loja.mercadoPago?.userId ||
      !loja.mercadoPago?.accessTokenEnc
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Mercado Pago não conectado."
      });
    }

    // 3. Recuperar o token criptografado
    const { descriptografar } = require("../utils/segredos");

    const accessToken = descriptografar(
      loja.mercadoPago.accessTokenEnc
    );

    // 4. Consultar a conta no provedor
    const resposta = await fetch(
      "https://api.mercadolibre.com/users/me",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!resposta.ok) {
      return res.status(502).json({
        sucesso: false,
        mensagem: "Falha ao validar o token no Mercado Pago.",
        statusProvedor: resposta.status
      });
    }

    const dados = await resposta.json();

    // 5. Conferir se a conta é a esperada
    const contaCorreta =
      String(dados.id) === String(loja.mercadoPago.userId);

    return res.status(contaCorreta ? 200 : 409).json({
      sucesso: contaCorreta,
      mensagem: contaCorreta
        ? "Conexão Mercado Pago validada com sucesso!"
        : "O token pertence a uma conta diferente.",
      contaCorreta,
      tokenExpiraEm: loja.mercadoPago.expiresAt
    });

  } catch (erro) {
    console.error("Erro no teste Mercado Pago:", erro.message);

    return res.status(502).json({
      sucesso: false,
      mensagem: "Não foi possível verificar a conexão."
    });
  }
});


module.exports = router;
