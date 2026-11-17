
module.exports = function exigirLogin(req, res, next) {
  if (!req.session?.usuarioLogado?.id) {
    return res.status(401).json({
      sucesso: false,
      mensagem: "É necessário estar logado."
    });
  }
  
  next();
};