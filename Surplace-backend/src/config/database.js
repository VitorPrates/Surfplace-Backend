const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Opções modernas já são padrão, mas você pode passar configurações aqui se necessário
    });

    console.log(`MongoDB Conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Erro ao conectar ao MongoDB: ${error.message}`);
    process.exit(1); // Encerra a aplicação em caso de falha crítica na conexão
  }
};

// Eventos opcionais para monitorar o estado da conexão
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose desconectado do MongoDB.');
});

module.exports = connectDB;