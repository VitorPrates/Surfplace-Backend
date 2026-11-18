
const express = require("express");
const path = require("path");
const session = require("express-session");
const cors = require("cors");

const produtosRoutes = require("./src/routes/produtos");
const userRoutes = require("./src/routes/userRoutes");
const lojasRoutes = require("./src/routes/lojas");
const checkoutRoutes = require("./src/routes/checkout");
const exigirLogin = require("./src/middlewares/exigirLogin");
const checkoutDemoRoutes = require("./src/routes/checkoutDemo");
const pedidosRoutes = require("./src/routes/pedidos");
const financeiroRoutes = require("./src/routes/financeiro");
const mercadoPagoRoutes = require(
  "./src/routes/mercadopago"
);

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(
  "/static",
  express.static(path.join(__dirname, "public"))
);

app.use(
  "/uploads",
  express.static(path.join(__dirname, "./src/Uploads"))
);


// Sessão
app.use(session({
  name: "connect.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Rotas
app.use("/api", userRoutes);
app.use("/api/pedidos", pedidosRoutes);

app.use("/api/checkout", checkoutDemoRoutes);

app.use(
  "/api/produtos",
  exigirLogin,
  produtosRoutes
);



app.use("/api/lojas", lojasRoutes);

app.use("/api/checkout", checkoutRoutes);

app.use("/api/checkout", checkoutDemoRoutes);

app.use("/api/mercadopago", mercadoPagoRoutes);

app.use("/api/financeiro", financeiroRoutes);
// Tratamento de erros
app.use((erro, req, res, next) => {
  console.error(erro);

  return res.status(500).json({
    sucesso: false,
    mensagem: "Erro interno do servidor."
  });
});

module.exports = app;