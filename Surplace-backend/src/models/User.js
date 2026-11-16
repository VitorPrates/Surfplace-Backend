
const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60
    },

    sobrenome: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },

    telefone: {
      type: String,
      required: true,
      trim: true
    },

    senhaHash: {
      type: String,
      required: true,
      select: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "Usuario",
  usuarioSchema,
  "usuarios"
);