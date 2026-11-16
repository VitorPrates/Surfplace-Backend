
const mongoose = require("mongoose");

const lojaSchema = new mongoose.Schema(
  {
    proprietario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      unique: true,
      index: true
    },

    nome: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    cnpj: {
      type: String,
      required: true,
      trim: true
    },

    descricao: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },

    logo: {
      type: String,
      default: null
    },

    // Usaremos este campo na etapa do mapa.
    localizacao: {
      type: {
        type: String,
        enum: ["Point"]
      },
      coordinates: {
        type: [Number]
      }
    }
  },
  {
    timestamps: true
  }
);

lojaSchema.index(
  { localizacao: "2dsphere" },
  { sparse: true }
);

module.exports = mongoose.model("Loja", lojaSchema);
