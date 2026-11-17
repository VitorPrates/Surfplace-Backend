
const mongoose = require("mongoose");

// Cada produto comprado
const itemPedidoSchema = new mongoose.Schema(
  {
    produto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Produto",
      required: true
    },

    nome: {
      type: String,
      required: true,
      trim: true
    },

    quantidade: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Quantidade inválida"
      }
    },
    tipoPagamento: {
        type: String,
        enum: ["mercadopago", "simulado"],
        default: "mercadopago"
    },

    simulado: {
        type: Boolean,
        default: false
    },
    precoUnitarioCentavos: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Preço inválido"
      }
    }
  },
  { _id: false }
);

const pedidoSchema = new mongoose.Schema(
  {
    loja: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loja",
      required: true,
      index: true
    },

    comprador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true
    },
    chaveCheckout: {
        type: String,
        required: true,
        immutable: true,
        trim: true
    },
    itens: {
      type: [itemPedidoSchema],
      required: true,
      validate: {
        validator: (itens) => itens.length > 0,
        message: "O pedido precisa de pelo menos um produto"
      }
    },

    totalCentavos: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Total inválido"
      }
    },

    // Situação financeira
    statusPagamento: {
      type: String,
      enum: [
        "aguardando",
        "aprovado",
        "recusado",
        "cancelado",
        "estornado"
      ],
      default: "aguardando",
      index: true
    },

    // Situação de preparação e retirada
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

    // Informações do Mercado Pago
    mercadoPago: {
      preferenciaId: {
        type: String,
        default: null
      },

      pagamentoId: {
        type: String,
        default: null
      },
      urlPagamento: {
        type: String,
        default: null
        },
      vendedorId: {
        type: String,
        default: null
      }
    },

    // Futuramente será apresentado
    // para retirada do produto na loja
    codigoRetirada: {
      type: String,
      default: undefined
    },

    // Datas de controle
    pagoEm: {
      type: Date,
      default: null
    },

    concluidoEm: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Consultar pedidos de uma loja
pedidoSchema.index({
  loja: 1,
  createdAt: -1
});

// Histórico de compras de um usuário
pedidoSchema.index({
  comprador: 1,
  createdAt: -1
});

// Evitar associar o mesmo pagamento
// a dois pedidos diferentes
pedidoSchema.index(
  { "mercadoPago.pagamentoId": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "mercadoPago.pagamentoId": {
        $type: "string"
      }
    }
  }
);

// Código de retirada único, quando existir
pedidoSchema.index(
  { codigoRetirada: 1 },
  {
    unique: true,
    partialFilterExpression: {
      codigoRetirada: {
        $type: "string"
      }
    }
  }
);
pedidoSchema.index(
  { comprador: 1, chaveCheckout: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "Pedido",
  pedidoSchema
);
