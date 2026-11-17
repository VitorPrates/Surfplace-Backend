
const crypto = require("crypto");

function obterChave() {
  const valor = process.env.MP_TOKEN_ENCRYPTION_KEY || "";

  if (!/^[a-fA-F0-9]{64}$/.test(valor)) {
    throw new Error("Chave de criptografia inválida.");
  }

  return Buffer.from(valor, "hex");
}

function criptografar(texto) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    obterChave(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(texto, "utf8"),
    cipher.final()
  ]);

  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex")
  ].join(":");
}

function descriptografar(valor) {
  const [iv, tag, dados] = valor.split(":");

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    obterChave(),
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(tag, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(dados, "hex")),
    decipher.final()
  ]).toString("utf8");
}

module.exports = {
  criptografar,
  descriptografar
};
