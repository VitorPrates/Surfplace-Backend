
const mongoose = require("mongoose");

const pedidoSchema = new mongoose.Schema(
  {
    loja: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loja",
      required: true,
      index: true
    },

    itens: [{
      produto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Produto",
        required: true
      },
      nome: String,
      quantidade: Number,
      precoUnitarioCentavos: Number
    }],

    totalCentavos: {
      type: Number,
      required: true,
      min: 0
    },

    status: {
      type: String,
      enum: [
        "aguardando_pagamento",
        "pago",
        "cancelado"
      ],
      default: "aguardando_pagamento"
    },

    preferenciaId: String,
    pagamentoId: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pedido", pedidoSchema);
