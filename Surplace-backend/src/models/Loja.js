
const mongoose = require("mongoose");

const pontoSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (coords) =>
          coords.length === 2 &&
          Number.isFinite(coords[0]) &&
          Number.isFinite(coords[1]) &&
          coords[0] >= -180 &&
          coords[0] <= 180 &&
          coords[1] >= -90 &&
          coords[1] <= 90,
        message: "Coordenadas inválidas"
      }
    }
  },
  { _id: false }
);

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
        type: pontoSchema,
        default: undefined
    },

    endereco: {
    cep: {
        type: String,
        trim: true,
        default: ""
    },

    logradouro: {
        type: String,
        trim: true,
        default: ""
    },

    numero: {
        type: String,
        trim: true,
        default: ""
    },

    bairro: {
        type: String,
        trim: true,
        default: ""
    },

    cidade: {
        type: String,
        trim: true,
        default: ""
    },

    uf: {
        type: String,
        trim: true,
        uppercase: true,
        default: ""
    },

    complemento: {
        type: String,
        trim: true,
        maxlength: 60,
        default: ""
    }
    },

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
