
const Loja = require("../models/Loja");

async function exigirLoja(req, res, next) {
  try {
    const usuarioId = req.session?.usuarioLogado?.id;

    if (!usuarioId) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "É necessário estar logado."
      });
    }

    const loja = await Loja.findOne({
      proprietario: usuarioId
    }).select("_id nome");

    if (!loja) {
      return res.status(403).json({
        sucesso: false,
        mensagem: "Você precisa cadastrar uma loja."
      });
    }

    // Disponibiliza a loja para as próximas funções
    req.loja = loja;

    next();

  } catch (erro) {
    next(erro);
  }
}

module.exports = exigirLoja;
