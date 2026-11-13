const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
 nome: { type: String, required: true, trim: true },
 sobrenome: { type: String, required: true, trim: true },
 email: { type: String, required: true, unique: true },
 telefone: { type: String, required: true, unique: true },
 senhaHash: { type: String, required: true, select: false }
});

const Usuario = mongoose.model(
 "Usuario", usuarioSchema, "usuarios"
);

module.exports = Usuario;