
const cache = new Map();

let ultimaConsulta = 0;
let emAndamento = false;

async function geocodificar(endereco) {
  const chave = endereco
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (cache.has(chave)) {
    return cache.get(chave);
  }

  // Limitação conservadora para desenvolvimento:
  // no máximo uma consulta externa por segundo.
  if (
    emAndamento ||
    Date.now() - ultimaConsulta < 1100
  ) {
    const erro = new Error(
      "Aguarde um instante antes de pesquisar novamente."
    );
    erro.status = 429;
    throw erro;
  }

  emAndamento = true;
  ultimaConsulta = Date.now();

  try {
    const url = new URL(
      "https://nominatim.openstreetmap.org/search"
    );

    url.searchParams.set("q", endereco);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");

    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": process.env.GEOCODER_USER_AGENT,
        "Accept": "application/json"
      }
    });

    if (!resposta.ok) {
      throw new Error(
        `Serviço de localização indisponível (${resposta.status})`
      );
    }

    const dados = await resposta.json();

    const primeiro = dados[0];

    if (!primeiro) {
      const erro = new Error("Endereço não encontrado.");
      erro.status = 404;
      throw erro;
    }

    const resultado = {
      latitude: Number(primeiro.lat),
      longitude: Number(primeiro.lon),
      descricao: primeiro.display_name
    };

    if (
      !Number.isFinite(resultado.latitude) ||
      !Number.isFinite(resultado.longitude)
    ) {
      throw new Error("Coordenadas inválidas.");
    }

    cache.set(chave, resultado);

    return resultado;

  } finally {
    emAndamento = false;
  }
}

module.exports = { geocodificar };

