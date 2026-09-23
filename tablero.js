const VISTA = window.IDEAL_VISTA;
const FORMACIONES = ["4-4-2","4-3-3","3-4-3","3-5-2","5-3-2","4-5-1"];
const ESCUDOS = { Cadiz: "Cádiz", Alaves: "Alavés" };
const FOTOS_LOCALES = {
  5339: "Alex_Grimaldo.webp",
  5836: "Alvaro_Carreras.webp",
  6034: "Gerard_Moreno.webp",
  5365: "Giuliano_Simeone.webp",
  5333: "Jan_Oblak.webp",
  5923: "Juan_Iglesias.webp",
  5853: "Jude_Bellingham.webp",
  5409: "Lamine_Yamal.webp",
  5425: "Natan.webp",
  5918: "Odysseas_Vlachodimos.webp",
  5640: "Ramon_Terrats.webp",
  5414: "Raphinha.webp",
  5610: "Roberto_Fernandez.webp",
  5387: "Xavi_Espart.webp",
  5789: "Yassir_Zabiri.webp"
};

let cliente = null;
try {
  cliente = window.supabase.createClient(window.MDL_SUPABASE_URL, window.MDL_SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
} catch (error) {
  cliente = null;
}

let jugadores = [];
let porId = new Map();
let slots = {};
let cargando = false;
let sucio = false;
let saveChain = Promise.resolve();
let saveTimer = null;
let idJugadorFoto = null;
let buscadorSlot = null;
const fotosFirmadas = new Map();

function fold(texto) {
  return (texto || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
function clubCorto(draftedBy) {
  return (draftedBy || "").split(" (")[0];
}
function escudoUrl(draftedBy) {
  const corto = clubCorto(draftedBy);
  const archivo = ESCUDOS[corto] || corto;
  return "./Escudos/" + encodeURIComponent(archivo) + ".png";
}
function slotVacio(clave) {
  return {
    playerId: null,
    points: null,
    appearances: 0,
    matches: VISTA === "media" ? 0 : null,
    benchPosition: clave.startsWith("sup_") ? "POR" : null
  };
}
function clavesActuales() {
  const formacion = document.getElementById("formacionSelect").value || "4-4-2";
  const [def, med, del] = formacion.split("-").map(Number);
  const claves = ["tit_por"];
  for (let i = 0; i < def; i++) claves.push("tit_def_" + i);
  for (let i = 0; i < med; i++) claves.push("tit_med_" + i);
  for (let i = 0; i < del; i++) claves.push("tit_del_" + i);
  const n = Math.min(12, Math.max(0, parseInt(document.getElementById("numSuplentesInput").value, 10) || 0));
  for (let i = 1; i <= n; i++) claves.push("sup_" + i);
  return claves;
}
function asegurarSlots() {
  const claves = clavesActuales();
  claves.forEach(clave => { if (!slots[clave]) slots[clave] = slotVacio(clave); });
  Object.keys(slots).forEach(clave => { if (!claves.includes(clave)) delete slots[clave]; });
  claves.forEach(clave => {
    if (!clave.startsWith("sup_")) slots[clave].benchPosition = null;
    if (VISTA !== "media") slots[clave].matches = null;
  });
}
function jugadorDe(slot) {
  return slot && slot.playerId ? porId.get(slot.playerId) : null;
}
function ocupados(excepto) {
  const ids = new Set();
  Object.entries(slots).forEach(([clave, slot]) => {
    if (clave !== excepto && slot.playerId) ids.add(slot.playerId);
  });
  return ids;
}
function mostrarEstado(texto, esError) {
  const nodo = document.getElementById("estado-guardado");
  nodo.textContent = texto || "";
  nodo.style.color = esError ? "#ff6b6b" : "#8dff9a";
}
function programarGuardado() {
  if (cargando) return;
  sucio = true;
  clearTimeout(saveTimer);
  mostrarEstado("Guardando…", false);
  saveTimer = setTimeout(() => {
    saveChain = saveChain.catch(() => {}).then(() => guardar()).catch(error => mostrarEstado(error.message || "No se pudo guardar", true));
  }, 400);
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (cargando || !sucio) return;
  saveChain = saveChain.catch(() => {}).then(() => guardar()).catch(error => {
    mostrarEstado(error.message || "No se pudo guardar", true);
    throw error;
  });
  await saveChain;
}
function leerPuntos(texto) {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return null;
  if (VISTA === "media") {
    const numero = Number(limpio);
    if (Number.isNaN(numero)) return null;
    return Math.round(numero * 100) / 100;
  }
  const entero = parseInt(limpio, 10);
  return Number.isNaN(entero) ? null : entero;
}
async function guardar() {
  if (cargando || !sucio) return;
  asegurarSlots();
  const formation = document.getElementById("formacionSelect").value;
  const bench_count = Math.min(12, Math.max(0, parseInt(document.getElementById("numSuplentesInput").value, 10) || 0));
  const { error: errorTablero } = await cliente.from("ideal_boards").upsert({
    kind: VISTA, formation, bench_count, updated_at: new Date().toISOString()
  });
  if (errorTablero) throw errorTablero;
  const claves = clavesActuales();
  const { error: errorBorrado } = await cliente.from("ideal_board_slots").delete().eq("board_kind", VISTA).not("slot_key", "in", "(" + claves.join(",") + ")");
  if (errorBorrado) throw errorBorrado;
  const filas = claves.map(slot_key => {
    const slot = slots[slot_key];
    return {
      board_kind: VISTA,
      slot_key,
      player_id: slot.playerId,
      points: slot.points,
      appearances: slot.appearances || 0,
      matches: VISTA === "media" ? (slot.matches || 0) : null,
      bench_position: slot_key.startsWith("sup_") ? (slot.benchPosition || "POR") : null
    };
  });
  const { error: errorHuecos } = await cliente.from("ideal_board_slots").upsert(filas, { onConflict: "board_kind,slot_key" });
  if (errorHuecos) throw errorHuecos;
  sucio = false;
  mostrarEstado("Guardado", false);
}
async function cargarTablero() {
  cargando = true;
  cerrarBuscador();
  const { data: tablero, error: errorTablero } = await cliente.from("ideal_boards").select("formation,bench_count").eq("kind", VISTA).maybeSingle();
  if (errorTablero) { cargando = false; mostrarEstado(errorTablero.message, true); return; }
  const formacion = tablero && FORMACIONES.includes(tablero.formation) ? tablero.formation : "4-4-2";
  const banquillo = tablero ? tablero.bench_count : 7;
  document.getElementById("formacionSelect").value = formacion;
  document.getElementById("numSuplentesInput").value = banquillo;
  slots = {};
  if (tablero) {
    const { data: filas, error: errorFilas } = await cliente.from("ideal_board_slots").select("slot_key,player_id,points,appearances,matches,bench_position").eq("board_kind", VISTA);
    if (errorFilas) { cargando = false; mostrarEstado(errorFilas.message, true); return; }
    (filas || []).forEach(fila => {
      slots[fila.slot_key] = {
        playerId: fila.player_id,
        points: fila.points === null || fila.points === undefined ? null : Number(fila.points),
        appearances: fila.appearances || 0,
        matches: VISTA === "media" ? (fila.matches || 0) : null,
        benchPosition: fila.bench_position
      };
    });
  }
  asegurarSlots();
  await pintarCampo();
  calcularRecuento();
  cargando = false;
  mostrarEstado("", false);
}
function lineaDe(clave) {
  if (clave === "tit_por") return "linea-portero";
  if (clave.startsWith("tit_def_")) return "linea-defensas";
  if (clave.startsWith("tit_med_")) return "linea-medios";
  if (clave.startsWith("tit_del_")) return "linea-delanteros";
  return "listaSuplentes";
}
async function urlFoto(ruta) {
  if (!ruta) return null;
  if (fotosFirmadas.has(ruta)) return fotosFirmadas.get(ruta);
  const { data, error } = await cliente.storage.from("player-photos").createSignedUrl(ruta, 3600);
  if (error || !data) return null;
  fotosFirmadas.set(ruta, data.signedUrl);
  return data.signedUrl;
}
async function pintarFoto(clave) {
  const foto = document.querySelector('[data-img-id="' + clave + '"]');
  if (!foto) return;
  const jugador = jugadorDe(slots[clave]);
  const aviso = foto.querySelector(".btn-subir-foto");
  if (jugador && jugador.photo_path) {
    const url = await urlFoto(jugador.photo_path);
    if (url) {
      foto.style.backgroundImage = "url('" + url + "')";
      foto.classList.add("con-foto");
      if (aviso) aviso.style.display = "none";
      return;
    }
  }
  foto.style.backgroundImage = "none";
  foto.classList.remove("con-foto");
  if (aviso) {
    aviso.style.display = "block";
    aviso.textContent = jugador ? "Cargar foto" : "";
  }
}
function crearTarjeta(clave) {
  const suplente = clave.startsWith("sup_");
  const slot = slots[clave];
  const jugador = jugadorDe(slot);
  const tarjeta = document.createElement("div");
  tarjeta.className = suplente ? "suplente-fila" : "jugador-card";
  tarjeta.dataset.slot = clave;

  const nombreBox = document.createElement("div");
  nombreBox.className = "nombre-container";
  const botones = document.createElement("div");
  botones.className = "botones-superiores-row";
  if (slot.playerId) {
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "btn-quitar";
    quitar.textContent = "×";
    quitar.title = "Quitar jugador";
    quitar.onclick = () => quitarJugador(clave);
    botones.appendChild(quitar);
  }
  nombreBox.appendChild(botones);

  const elegir = document.createElement("button");
  elegir.type = "button";
  elegir.className = "btn-elegir" + (jugador ? " con-nombre" : "");
  elegir.textContent = jugador ? jugador.name : "Elegir";
  elegir.onclick = () => abrirSelector(clave);
  nombreBox.appendChild(elegir);

  const fotoWrap = document.createElement("div");
  fotoWrap.className = "wrapper-foto-onces";
  const foto = document.createElement("div");
  foto.className = "foto-container";
  foto.dataset.imgId = clave;
  const aviso = document.createElement("span");
  aviso.className = "btn-subir-foto";
  aviso.textContent = "";
  foto.appendChild(aviso);
  foto.onclick = () => pedirFoto(clave);
  const badge = document.createElement("div");
  badge.className = "badge-onces-flotante";
  const onces = document.createElement("input");
  onces.type = "number";
  onces.min = "0";
  onces.value = slot.appearances || 0;
  onces.addEventListener("input", () => {
    slots[clave].appearances = Math.max(0, parseInt(onces.value, 10) || 0);
    programarGuardado();
  });
  badge.appendChild(onces);
  fotoWrap.appendChild(foto);
  fotoWrap.appendChild(badge);

  const equipo = document.createElement("div");
  equipo.className = "equipo-container";
  const escudo = document.createElement("div");
  escudo.className = "escudo-miniatura";
  if (jugador) escudo.style.backgroundImage = "url('" + escudoUrl(jugador.drafted_by) + "')";
  const club = document.createElement("span");
  club.className = "club-nombre";
  club.textContent = jugador ? clubCorto(jugador.drafted_by) : "";
  equipo.appendChild(escudo);
  equipo.appendChild(club);

  const puntosBox = document.createElement("div");
  puntosBox.className = "pts-container";
  const puntos = document.createElement("input");
  puntos.type = "number";
  puntos.className = "jugador-pts";
  puntos.placeholder = "0";
  if (VISTA === "media") puntos.step = "0.01";
  puntos.value = slot.points === null || slot.points === undefined ? "" : slot.points;
  puntos.addEventListener("input", () => {
    slots[clave].points = leerPuntos(puntos.value);
    actualizarMarcador();
    programarGuardado();
  });
  const etiqueta = document.createElement("span");
  etiqueta.className = "label-pts";
  etiqueta.textContent = VISTA === "media" ? "m" : "pts";
  puntosBox.appendChild(puntos);
  puntosBox.appendChild(etiqueta);
  if (VISTA === "media") {
    const partidos = document.createElement("input");
    partidos.type = "number";
    partidos.min = "0";
    partidos.step = "1";
    partidos.className = "jugador-pj";
    partidos.value = slot.matches || 0;
    partidos.addEventListener("input", () => {
      slots[clave].matches = Math.max(0, parseInt(partidos.value, 10) || 0);
      programarGuardado();
    });
    const etiquetaPj = document.createElement("span");
    etiquetaPj.className = "label-pj";
    etiquetaPj.textContent = "pj";
    puntosBox.appendChild(partidos);
    puntosBox.appendChild(etiquetaPj);
  }

  if (suplente) {
    const fila = document.createElement("div");
    fila.className = "suplente-row-inline";
    const posicion = document.createElement("select");
    posicion.className = "select-posicion-suplente";
    ["POR","DEF","MED","DEL"].forEach(valor => {
      const opcion = document.createElement("option");
      opcion.value = valor;
      opcion.textContent = valor;
      posicion.appendChild(opcion);
    });
    posicion.value = ["POR","DEF","MED","DEL"].includes(slot.benchPosition) ? slot.benchPosition : "POR";
    posicion.addEventListener("change", () => {
      slots[clave].benchPosition = posicion.value;
      const elegido = jugadorDe(slots[clave]);
      if (elegido && elegido.position !== posicion.value) {
        slots[clave].playerId = null;
        slots[clave].points = 0;
        pintarCampo().then(calcularRecuento);
      }
      programarGuardado();
    });
    fila.appendChild(posicion);
    fila.appendChild(nombreBox);
    const datos = document.createElement("div");
    datos.className = "suplente-datos";
    datos.appendChild(fila);
    datos.appendChild(equipo);
    datos.appendChild(puntosBox);
    tarjeta.appendChild(fotoWrap);
    tarjeta.appendChild(datos);
  } else {
    tarjeta.appendChild(nombreBox);
    tarjeta.appendChild(fotoWrap);
    tarjeta.appendChild(equipo);
    tarjeta.appendChild(puntosBox);
  }
  return tarjeta;
}
async function pintarCampo() {
  ["linea-delanteros","linea-medios","linea-defensas","linea-portero","listaSuplentes"].forEach(id => {
    document.getElementById(id).textContent = "";
  });
  asegurarSlots();
  const orden = ["tit_del_","tit_med_","tit_def_","tit_por","sup_"];
  const claves = clavesActuales().slice().sort((a, b) => {
    const ia = orden.findIndex(prefijo => a === prefijo || a.startsWith(prefijo));
    const ib = orden.findIndex(prefijo => b === prefijo || b.startsWith(prefijo));
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, "es", { numeric: true });
  });
  claves.forEach(clave => {
    document.getElementById(lineaDe(clave)).appendChild(crearTarjeta(clave));
  });
  await Promise.all(claves.map(pintarFoto));
  actualizarMarcador();
}
function actualizarMarcador() {
  const valores = [];
  Object.entries(slots).forEach(([clave, slot]) => {
    if (!clave.startsWith("tit_") || !slot.playerId || slot.points === null || slot.points === undefined || slot.points === "") return;
    const numero = Number(slot.points);
    if (!Number.isNaN(numero)) valores.push(numero);
  });
  const caja = document.getElementById("marcadorSumaTotal");
  if (!valores.length) { caja.textContent = "0"; return; }
  if (VISTA === "media") {
    const media = valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
    caja.textContent = String(Math.round(media * 100) / 100);
    return;
  }
  caja.textContent = String(valores.reduce((suma, valor) => suma + valor, 0));
}
function calcularRecuento() {
  const conteo = {};
  Object.entries(slots).forEach(([clave, slot]) => {
    const jugador = jugadorDe(slot);
    if (!jugador || !jugador.drafted_by) return;
    const club = jugador.drafted_by;
    if (!conteo[club]) conteo[club] = { titulares: 0, total: 0 };
    conteo[club].total += 1;
    if (clave.startsWith("tit_")) conteo[club].titulares += 1;
  });
  const ordenados = Object.entries(conteo).sort((a, b) => {
    if (b[1].titulares !== a[1].titulares) return b[1].titulares - a[1].titulares;
    if (b[1].total !== a[1].total) return b[1].total - a[1].total;
    return clubCorto(a[0]).localeCompare(clubCorto(b[0]), "es");
  });
  const lista = document.getElementById("recuentoEquiposLista");
  lista.textContent = "";
  let puesto = 1;
  ordenados.forEach(([club, datos], indice) => {
    if (indice > 0) {
      const previo = ordenados[indice - 1][1];
      if (datos.titulares !== previo.titulares || datos.total !== previo.total) puesto = indice + 1;
    }
    const item = document.createElement("div");
    item.className = "recuento-fila-item";
    const marca = document.createElement("span");
    marca.className = "recuento-puesto";
    marca.textContent = puesto + "º";
    const escudo = document.createElement("div");
    escudo.className = "escudo-miniatura";
    escudo.style.backgroundImage = "url('" + escudoUrl(club) + "')";
    const texto = document.createElement("span");
    texto.textContent = clubCorto(club);
    const barra = document.createElement("span");
    barra.className = "recuento-barra-visual";
    barra.textContent = datos.titulares + "/" + datos.total;
    item.appendChild(marca);
    item.appendChild(escudo);
    item.appendChild(texto);
    item.appendChild(barra);
    lista.appendChild(item);
  });
}
function quitarJugador(clave) {
  slots[clave].playerId = null;
  slots[clave].points = 0;
  pintarCampo().then(calcularRecuento);
  programarGuardado();
}
function puestoDe(clave) {
  if (clave === "tit_por") return "POR";
  if (clave.startsWith("tit_def_")) return "DEF";
  if (clave.startsWith("tit_med_")) return "MED";
  if (clave.startsWith("tit_del_")) return "DEL";
  const marcado = slots[clave] && slots[clave].benchPosition;
  return ["POR","DEF","MED","DEL"].includes(marcado) ? marcado : "POR";
}
function nombrePuesto(puesto) {
  return { POR: "portero", DEF: "defensa", MED: "medio", DEL: "delantero" }[puesto] || "jugador";
}
function elegirJugador(clave, playerId) {
  if (ocupados(clave).has(playerId)) {
    mostrarEstado("Ese jugador ya está en otro hueco", true);
    cerrarBuscador();
    return;
  }
  const jugador = porId.get(playerId);
  if (!jugador || jugador.position !== puestoDe(clave)) {
    mostrarEstado("Ese jugador no ocupa ese puesto", true);
    cerrarBuscador();
    return;
  }
  slots[clave].playerId = playerId;
  cerrarBuscador();
  pintarCampo().then(calcularRecuento);
  programarGuardado();
}
function abrirSelector(clave) {
  buscadorSlot = clave;
  document.getElementById("elige-titulo").textContent = "Elegir " + nombrePuesto(puestoDe(clave));
  document.getElementById("elige").classList.remove("oculto");
  const buscar = document.getElementById("elige-buscar");
  buscar.value = "";
  pintarListaJugadores("");
  buscar.focus();
}
function pintarListaJugadores(consulta) {
  const lista = document.getElementById("elige-lista");
  const vacio = document.getElementById("elige-vacio");
  lista.textContent = "";
  if (!jugadores.length) {
    vacio.textContent = "No se han cargado los jugadores. Recarga la página.";
    vacio.classList.remove("oculto");
    return;
  }
  const texto = fold(consulta.trim());
  const usados = ocupados(buscadorSlot);
  const puesto = puestoDe(buscadorSlot);
  const resultados = jugadores.filter(jugador => {
    if (jugador.position !== puesto) return false;
    return !texto || fold(jugador.name).includes(texto) || fold(clubCorto(jugador.drafted_by)).includes(texto);
  });
  if (!resultados.length) {
    vacio.textContent = "Ningún " + nombrePuesto(puesto) + " con ese nombre.";
    vacio.classList.remove("oculto");
    return;
  }
  vacio.classList.add("oculto");
  resultados.forEach(jugador => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.disabled = usados.has(jugador.id);
    const nombre = document.createElement("div");
    nombre.textContent = jugador.name;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = jugador.position + " · " + clubCorto(jugador.drafted_by) + (usados.has(jugador.id) ? " · ya está en el once" : "");
    boton.appendChild(nombre);
    boton.appendChild(meta);
    boton.onclick = () => elegirJugador(buscadorSlot, jugador.id);
    lista.appendChild(boton);
  });
}
function cerrarBuscador() {
  buscadorSlot = null;
  document.getElementById("elige").classList.add("oculto");
}
function pedirFoto(clave) {
  const jugador = jugadorDe(slots[clave]);
  if (!jugador || jugador.photo_path) return;
  idJugadorFoto = jugador.id;
  document.getElementById("globalImageInput").click();
}
async function subirFoto(file) {
  const id = idJugadorFoto;
  idJugadorFoto = null;
  if (!id || !file) return;
  if (file.size > 5 * 1024 * 1024) {
    mostrarEstado("La foto pasa de 5 MB", true);
    return;
  }
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const ruta = id + "." + extension;
  const { error: errorSubida } = await cliente.storage.from("player-photos").upload(ruta, file, {
    contentType: file.type || "image/jpeg",
    upsert: true
  });
  if (errorSubida) { mostrarEstado(errorSubida.message, true); return; }
  const { error: errorFila } = await cliente.from("players").update({ photo_path: ruta }).eq("id", id);
  if (errorFila) { mostrarEstado(errorFila.message, true); return; }
  const jugador = porId.get(id);
  if (jugador) jugador.photo_path = ruta;
  fotosFirmadas.delete(ruta);
  await pintarCampo();
  mostrarEstado("Foto guardada", false);
}
async function sembrarFotosLocales() {
  for (const jugador of jugadores) {
    const archivo = FOTOS_LOCALES[jugador.id];
    if (!archivo || jugador.photo_path) continue;
    try {
      const respuesta = await fetch("./Jugadores/" + archivo);
      if (!respuesta.ok) continue;
      const bytes = new Uint8Array(await respuesta.arrayBuffer());
      const esWebp = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
      if (!esWebp) continue;
      const blob = new Blob([bytes], { type: "image/webp" });
      const ruta = jugador.id + ".webp";
      const { error: errorSubida } = await cliente.storage.from("player-photos").upload(ruta, blob, {
        contentType: "image/webp",
        upsert: true
      });
      if (errorSubida) continue;
      const { error: errorFila } = await cliente.from("players").update({ photo_path: ruta }).eq("id", jugador.id);
      if (!errorFila) jugador.photo_path = ruta;
    } catch (error) {
      continue;
    }
  }
}
async function cargarJugadores() {
  const { data, error } = await cliente.from("players").select("id,name,position,real_team,drafted_by,photo_path").not("drafted_by", "is", null).order("name");
  if (error) throw error;
  jugadores = data || [];
  porId = new Map(jugadores.map(jugador => [jugador.id, jugador]));
  await sembrarFotosLocales();
}
function mostrarErrorLogin(mensaje) {
  const nodo = document.getElementById("login-error");
  const texto = document.getElementById("login-error-texto");
  const tablero = document.getElementById("login-form");
  texto.textContent = mensaje || "";
  nodo.classList.toggle("visible", !!mensaje);
  if (!mensaje) return;
  tablero.classList.remove("fallo");
  void tablero.offsetWidth;
  tablero.classList.add("fallo");
  nodo.scrollIntoView({ block: "nearest" });
}
function mostrarLogin(mensaje) {
  document.getElementById("app").classList.add("oculto");
  document.getElementById("login-screen").classList.remove("oculto");
  mostrarErrorLogin(mensaje);
}
function mensajeDeLogin(error) {
  const texto = (error && error.message ? error.message : "").toLowerCase();
  if (!error || texto.includes("invalid login") || texto.includes("invalid credentials")) {
    return "Contraseña incorrecta. Es la de la cuenta del draft, no la de tu correo.";
  }
  if (texto.includes("fetch") || texto.includes("network") || texto.includes("failed to")) {
    return "No hay conexión con la base. Recarga la página y prueba otra vez.";
  }
  return "No se pudo entrar. " + (error.message || "Prueba otra vez.");
}
function mostrarApp() {
  document.getElementById("login-screen").classList.add("oculto");
  document.getElementById("app").classList.remove("oculto");
}
async function sesionEsEditor() {
  const { data, error } = await cliente.from("ideal_editors").select("manager_id").maybeSingle();
  if (error) throw error;
  return !!data;
}
async function entrarConSesion() {
  if (VISTA !== "media" && VISTA !== "totales") {
    mostrarErrorLogin("Esta vista no existe.");
    return;
  }
  if (!cliente) {
    mostrarErrorLogin("No se pudo conectar. Recarga la página.");
    return;
  }
  const { data: sesion, error: errorSesion } = await cliente.auth.getSession();
  if (errorSesion) { mostrarErrorLogin(mensajeDeLogin(errorSesion)); return; }
  if (!sesion.session) { mostrarLogin(""); return; }
  let editor = false;
  try { editor = await sesionEsEditor(); }
  catch (error) { mostrarErrorLogin(mensajeDeLogin(error)); return; }
  if (!editor) {
    await cliente.auth.signOut();
    mostrarErrorLogin("Esta cuenta no puede editar el once.");
    return;
  }
  try {
    await cargarJugadores();
    await cargarTablero();
    mostrarApp();
  } catch (error) {
    mostrarErrorLogin(mensajeDeLogin(error));
  }
}
document.querySelectorAll(".login-club input").forEach(radio => {
  radio.addEventListener("change", () => {
    mostrarErrorLogin("");
    document.getElementById("login-password").focus();
  });
});
async function entrarAlCampo(evento) {
  if (evento) evento.preventDefault();
  mostrarErrorLogin("");
  const elegido = document.querySelector(".login-club input:checked");
  const alias = { jraga: "manager13@draft2026.com", hill: "manager19@draft2026.com" };
  const email = elegido ? alias[elegido.value] : "";
  const password = document.getElementById("login-password").value;
  if (!email) {
    mostrarErrorLogin("Elige el escudo de Jraga o el de Hill.");
    return;
  }
  if (!password) {
    mostrarErrorLogin("Falta la contraseña.");
    return;
  }
  if (!cliente) {
    mostrarErrorLogin("No se pudo conectar. Recarga la página.");
    return;
  }
  const boton = document.getElementById("login-submit");
  boton.disabled = true;
  boton.textContent = "Entrando…";
  try {
    const { error } = await cliente.auth.signInWithPassword({ email, password });
    if (error) {
      mostrarErrorLogin(mensajeDeLogin(error));
      return;
    }
    await entrarConSesion();
  } catch (error) {
    mostrarErrorLogin(mensajeDeLogin(error));
  } finally {
    boton.disabled = false;
    boton.textContent = "Entrar al campo";
  }
}
document.querySelectorAll(".vistas a").forEach(enlace => {
  enlace.addEventListener("click", async evento => {
    if (enlace.classList.contains("activa")) { evento.preventDefault(); return; }
    evento.preventDefault();
    try { await flushSave(); }
    catch (error) { mostrarEstado(error.message, true); return; }
    location.href = enlace.getAttribute("href");
  });
});
document.getElementById("btn-guardar").addEventListener("click", async () => {
  const boton = document.getElementById("btn-guardar");
  boton.disabled = true;
  sucio = true;
  try {
    await flushSave();
    mostrarEstado("Guardado", false);
  } catch (error) {
    mostrarEstado(error.message || "No se pudo guardar", true);
  } finally {
    boton.disabled = false;
  }
});
document.getElementById("elige-cerrar").addEventListener("click", cerrarBuscador);
document.getElementById("elige").addEventListener("click", evento => {
  if (evento.target.id === "elige") cerrarBuscador();
});
document.getElementById("elige-buscar").addEventListener("input", evento => {
  pintarListaJugadores(evento.target.value);
});
document.getElementById("btn-salir").addEventListener("click", async () => {
  try { await flushSave(); } catch (error) { mostrarEstado(error.message, true); }
  await cliente.auth.signOut();
  mostrarLogin("");
});
document.getElementById("btn-borrar").addEventListener("click", async () => {
  const nombre = VISTA === "media" ? "la media" : "los totales";
  if (!confirm("¿Borrar " + nombre + "?")) return;
  clearTimeout(saveTimer);
  cargando = true;
  try { await saveChain; } catch (error) { /* el borrado manda */ }
  sucio = false;
  const { error } = await cliente.from("ideal_boards").delete().eq("kind", VISTA);
  cargando = false;
  if (error) { mostrarEstado(error.message, true); return; }
  await cargarTablero();
});
document.getElementById("formacionSelect").addEventListener("change", async () => {
  asegurarSlots();
  await pintarCampo();
  calcularRecuento();
  programarGuardado();
});
document.getElementById("numSuplentesInput").addEventListener("change", async () => {
  let valor = parseInt(document.getElementById("numSuplentesInput").value, 10);
  if (Number.isNaN(valor) || valor < 0) valor = 0;
  if (valor > 12) valor = 12;
  document.getElementById("numSuplentesInput").value = valor;
  asegurarSlots();
  await pintarCampo();
  calcularRecuento();
  programarGuardado();
});
document.getElementById("globalImageInput").addEventListener("change", async evento => {
  const file = evento.target.files && evento.target.files[0];
  evento.target.value = "";
  await subirFoto(file);
});
entrarConSesion();
