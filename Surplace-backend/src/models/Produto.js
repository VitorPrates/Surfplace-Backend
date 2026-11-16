
const mongoose = require("mongoose");

const produtoSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: [true, "O nome é obrigatório"],
      trim: true,
      maxlength: [60, "O nome deve ter no máximo 60 caracteres"]
    },

    precoCentavos: {
      type: Number,
      required: [true, "O preço é obrigatório"],
      min: [0, "O preço não pode ser negativo"],
      validate: {
        validator: Number.isSafeInteger,
        message: "O preço deve ser um número inteiro de centavos"
      }
    },

    fotos: {
      type: [String],
      default: [],
      validate: {
        validator: (fotos) => fotos.length <= 5,
        message: "O produto pode ter no máximo 5 fotos"
      }
    },

    descricao: {
      type: String,
      required: [true, "A descrição é obrigatória"],
      trim: true
    },
    quantidade: {
      type: Number,
      required: [true, "A quantidade é obrigatória"],
      min: [0, "A quantidade não pode ser negativa"],
      validate: {
        validator: Number.isSafeInteger,
        message: "A quantidade deve ser um número inteiro"
      }
    },

    tags: {
      type: [String],
      default: []
    },

    loja: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loja",
      required: [true, "O produto deve pertencer a uma loja"],
      index: true
    },

  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Produto", produtoSchema);
