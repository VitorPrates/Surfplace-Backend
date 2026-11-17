
const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  produto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Produto",
    required: true
  },
  nome: {
    type: String,
    required: true
  },
  quantidade: {
    type: Number,
    required: true,
    min: 1
  },
  precoUnitarioCentavos: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const pedidoSchema = new mongoose.Schema({
  loja: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Loja",
    required: true,
    index: true
  },

  comprador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    required: true
  },

  itens: {
    type: [itemSchema],
    required: true
  },

  totalCentavos: {
    type: Number,
    required: true
  },

  statusPagamento: {
    type: String,
    enum: [
      "aguardando",
      "aprovado",
      "recusado",
      "cancelado",
      "estornado"
    ],
    default: "aguardando"
  },

  statusPedido: {
    type: String,
    enum: [
      "pendente",
      "em_preparacao",
      "pronto",
      "concluido",
      "cancelado"
    ],
    default: "pendente"
  },

  mercadoPago: {
    preferenciaId: String,
    pagamentoId: String,
    vendedorId: String
  },

  codigoRetirada: {
    type: String,
    unique: true,
    sparse: true
  },

  pagoEm: Date,
  concluidoEm: Date

}, {
  timestamps: true
});

pedidoSchema.index({
  loja: 1,
  createdAt: -1
});


module.exports = mongoose.model("Pedido", pedidoSchema);
