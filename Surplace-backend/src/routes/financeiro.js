
const express = require("express");
const mongoose = require("mongoose");

const Loja = require("../models/Loja");
const Pedido = require("../models/Pedido");

// Ajuste apenas o caminho se o seu middleware
// exigirLogin estiver em outra pasta.
const exigirLogin = require("../middlewares/exigirLogin");

const router = express.Router();

router.use(exigirLogin);

router.get("/resumo", async (req, res) => {
  try {
    const usuarioId = req.session?.usuarioLogado?.id;

    if (!mongoose.isValidObjectId(usuarioId)) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Faça login para continuar."
      });
    }

    // Períodos disponíveis: 7, 30 ou 90 dias.
    const dias = Number(req.query.dias ?? 30);

    if (![7, 30, 90].includes(dias)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Período inválido. Use 7, 30 ou 90 dias."
      });
    }

    // Identificar a loja pela sessão.
    const loja = await Loja.findOne({
      proprietario: usuarioId
    })
      .select("_id nome")
      .lean();

    if (!loja) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Loja não encontrada."
      });
    }

    const agora = new Date();

    // Janela móvel de N dias.
    const inicio = new Date(
      agora.getTime() - dias * 24 * 60 * 60 * 1000
    );

    const baseLoja = {
      loja: loja._id,
      simulado: true,
      tipoPagamento: "simulado"
    };

    // Faturamento: somente vendas concluídas
    // com pagamento demonstrativo aprovado.
    const filtroConcluidos = {
      ...baseLoja,
      statusPagamento: "aprovado",
      statusPedido: "concluido",
      concluidoEm: {
        $gte: inicio,
        $lte: agora
      }
    };

    // Pedidos criados no período, para
    // acompanhar andamento e cancelamentos.
    const filtroCriados = {
      ...baseLoja,
      createdAt: {
        $gte: inicio,
        $lte: agora
      }
    };

    const [
      totais,
      vendasPorDia,
      situacoes,
      ultimasVendas
    ] = await Promise.all([

      // 1. Indicadores financeiros
      Pedido.aggregate([
        { $match: filtroConcluidos },
        {
          $group: {
            _id: null,
            faturamentoCentavos: {
              $sum: "$totalCentavos"
            },
            pedidosConcluidos: {
              $sum: 1
            },
            unidadesVendidas: {
              $sum: {
                $reduce: {
                  input: "$itens",
                  initialValue: 0,
                  in: {
                    $add: [
                      "$$value",
                      "$$this.quantidade"
                    ]
                  }
                }
              }
            }
          }
        }
      ]),

      // 2. Série diária para o gráfico
      Pedido.aggregate([
        { $match: filtroConcluidos },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$concluidoEm",
                timezone: "America/Sao_Paulo"
              }
            },
            faturamentoCentavos: {
              $sum: "$totalCentavos"
            },
            pedidos: {
              $sum: 1
            }
          }
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            data: "$_id",
            faturamentoCentavos: 1,
            pedidos: 1
          }
        }
      ]),

      // 3. Situação dos pedidos criados no período
      Pedido.aggregate([
        { $match: filtroCriados },
        {
          $group: {
            _id: "$statusPedido",
            quantidade: { $sum: 1 }
          }
        }
      ]),

      // 4. Histórico recente das vendas concluídas
      Pedido.find(filtroConcluidos)
        .sort({
          concluidoEm: -1,
          _id: -1
        })
        .limit(20)
        .select(
          "_id itens totalCentavos " +
          "statusPedido simulado " +
          "createdAt concluidoEm"
        )
        .lean()
    ]);

    const indicadores = totais[0] || {
      faturamentoCentavos: 0,
      pedidosConcluidos: 0,
      unidadesVendidas: 0
    };

    const faturamentoCentavos =
      indicadores.faturamentoCentavos || 0;

    const pedidosConcluidos =
      indicadores.pedidosConcluidos || 0;

    const unidadesVendidas =
      indicadores.unidadesVendidas || 0;

    const ticketMedioCentavos =
      pedidosConcluidos > 0
        ? Math.round(
            faturamentoCentavos / pedidosConcluidos
          )
        : 0;

    const quantidadesPorStatus = Object.fromEntries(
      situacoes.map(item => [
        item._id,
        item.quantidade
      ])
    );

    const pedidosPendentes =
      (quantidadesPorStatus.pendente || 0) +
      (quantidadesPorStatus.em_preparacao || 0);

    const pedidosProntos =
      quantidadesPorStatus.pronto || 0;

    const pedidosCancelados =
      quantidadesPorStatus.cancelado || 0;

    return res.status(200).json({
      sucesso: true,

      demonstrativo: true,

      loja: {
        _id: loja._id,
        nome: loja.nome
      },

      periodo: {
        dias,
        inicio,
        fim: agora
      },

      indicadores: {
        faturamentoCentavos,
        pedidosConcluidos,
        unidadesVendidas,
        ticketMedioCentavos,
        pedidosPendentes,
        pedidosProntos,
        pedidosCancelados
      },

      vendasPorDia,
      ultimasVendas
    });

  } catch (erro) {
    console.error(
      "[Financeiro resumo]",
      erro
    );

    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao consultar o financeiro."
    });
  }
});

module.exports = router;
