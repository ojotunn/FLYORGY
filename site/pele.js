// A PELE da mosca: melhora o acabamento do modelo anatomico (NeuroMechFly v2) sem trocar a malha.
//
// Por que nao baixar um modelo bonito da internet: o corpo daqui e movido por 99 angulos de junta que
// vem do MuJoCo (femur, tibia, tarso, asa, cabeca, cada anel do abdomen). Um modelo de banco de assets
// nao tem esse esqueleto - viraria uma estatua bonita e parada. Entao o caminho e melhorar ESTE.
//
// O que muda, tudo gerado em canvas na hora (nenhum arquivo baixado):
//   * quitina: brilho especular e reflexo do ambiente, com micro-relevo (o corpo deixa de ser fosco)
//   * olho composto: grade hexagonal de omatidios em relevo, verniz por cima - e a marca da mosca
//   * asa: nervuras desenhadas + iridescencia (aquele arco-iris que a asa de mosca faz na luz)
//   * pernas: eram translucidas (alfa 0,5 no tarso) e pareciam fantasma; agora sao opacas e peludas
//   * um mapa de ambiente com as cores do clube, para o corpo escuro pegar o neon
window.Pele = (function () {

  function canvas(w, h, desenhar) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    desenhar(c.getContext('2d'), w, h);
    return c;
  }
  function tex(c, rep) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (rep) t.repeat.set(rep, rep);
    return t;
  }

  // ---------- micro-relevo da quitina: poros e pelinhos ----------
  let _quitina = null;
  function bumpQuitina() {
    if (_quitina) return _quitina;
    return _quitina = tex(canvas(512, 512, (x, w, h) => {
      x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {                       // poros
        const r = 0.6 + Math.random() * 1.6;
        x.fillStyle = Math.random() < 0.5 ? 'rgba(40,40,40,.55)' : 'rgba(210,210,210,.45)';
        x.beginPath(); x.arc(Math.random() * w, Math.random() * h, r, 0, 6.283); x.fill();
      }
      x.lineWidth = 1.1;                                     // pelinhos deitados
      for (let i = 0; i < 1400; i++) {
        const px = Math.random() * w, py = Math.random() * h, a = -1.1 + Math.random() * 0.5, l = 5 + Math.random() * 9;
        x.strokeStyle = 'rgba(235,235,235,.5)';
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
      }
    }), 3);
  }

  // ---------- olho composto: grade hexagonal ----------
  let _olho = null;
  function bumpOlho() {
    if (_olho) return _olho;
    return _olho = tex(canvas(1024, 1024, (x, w, h) => {
      x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, w, h);
      const r = 9, dx = r * 1.732, dy = r * 1.5;
      for (let j = 0, y = 0; y < h + dy; y += dy, j++) {
        for (let px = (j % 2 ? dx / 2 : 0); px < w + dx; px += dx) {
          x.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 180 * (60 * k - 30);
            const vx = px + r * 0.94 * Math.cos(a), vy = y + r * 0.94 * Math.sin(a);
            k ? x.lineTo(vx, vy) : x.moveTo(vx, vy);
          }
          x.closePath();
          const g = x.createRadialGradient(px - r * 0.3, y - r * 0.3, 1, px, y, r);
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#9a9a9a'); g.addColorStop(1, '#2a2a2a');
          x.fillStyle = g; x.fill();
        }
      }
    }), 1);
  }

  // ---------- asa: nervuras ----------
  let _asa = null, _asaAlfa = null;
  function texAsa() {
    if (_asa) return { bump: _asa, alfa: _asaAlfa };
    const nervura = (x, w, h, cor, larg) => {
      x.strokeStyle = cor; x.lineCap = 'round';
      const linhas = [
        [[0.02, 0.52], [0.30, 0.40], [0.70, 0.33], [0.99, 0.30]],
        [[0.03, 0.55], [0.32, 0.52], [0.72, 0.48], [0.99, 0.45]],
        [[0.04, 0.58], [0.34, 0.63], [0.72, 0.65], [0.98, 0.63]],
        [[0.05, 0.61], [0.33, 0.74], [0.70, 0.80], [0.95, 0.80]],
        [[0.06, 0.64], [0.30, 0.86], [0.60, 0.93], [0.86, 0.94]],
      ];
      for (const pts of linhas) {
        x.lineWidth = larg; x.beginPath();
        x.moveTo(pts[0][0] * w, pts[0][1] * h);
        for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0] * w, pts[i][1] * h);
        x.stroke();
      }
      x.lineWidth = larg * 0.7;                       // nervuras transversais
      for (const [a, b] of [[[0.30, 0.40], [0.32, 0.52]], [[0.58, 0.35], [0.60, 0.47]], [[0.40, 0.55], [0.42, 0.66]]]) {
        x.beginPath(); x.moveTo(a[0] * w, a[1] * h); x.lineTo(b[0] * w, b[1] * h); x.stroke();
      }
    };
    _asa = tex(canvas(1024, 512, (x, w, h) => {
      x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, w, h);
      nervura(x, w, h, '#ffffff', 7);
      nervura(x, w, h, 'rgba(60,60,60,.5)', 2);
    }), 1);
    _asaAlfa = tex(canvas(1024, 512, (x, w, h) => {
      x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, w, h);     // membrana quase transparente
      nervura(x, w, h, '#e8e8e8', 6);                       // nervura fecha mais a luz
    }), 1);
    return { bump: _asa, alfa: _asaAlfa };
  }

  // ---------- ambiente: o clube refletido no corpo ----------
  function ambiente(renderer, scene) {
    const c = canvas(1024, 512, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#07040a'); g.addColorStop(0.52, '#2a0c16'); g.addColorStop(0.75, '#140a12'); g.addColorStop(1, '#050308');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      const focos = [[0.16, 0.42, 150, 'rgba(255,47,42,.95)'], [0.40, 0.30, 110, 'rgba(77,107,255,.8)'],
                     [0.66, 0.45, 160, 'rgba(255,79,150,.9)'], [0.88, 0.34, 120, 'rgba(255,180,61,.8)'],
                     [0.50, 0.10, 190, 'rgba(255,255,255,.35)']];
      for (const [fx, fy, r, cor] of focos) {
        const rg = x.createRadialGradient(fx * w, fy * h, 2, fx * w, fy * h, r);
        rg.addColorStop(0, cor); rg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = rg; x.fillRect(fx * w - r, fy * h - r, r * 2, r * 2);
      }
    });
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(t).texture;
      pm.dispose();
    } catch (e) { scene.environment = t; }
    return scene.environment;
  }

  // ---------- troca os materiais crus por materiais de bicho ----------
  // mats/matsE: os dicionarios que o cliente montou; defs: j.materiais do modelo.
  function melhorar(mats, matsE, defs) {
    const bq = bumpQuitina(), bo = bumpOlho(), asa = texAsa();
    for (const [k, m] of Object.entries(mats)) {
      const d = defs[k] || {};
      const nome = k;
      if (nome === 'eye_material') {
        // olho composto: vermelho fundo, omatidios em relevo, verniz por cima
        const novo = new THREE.MeshPhysicalMaterial({
          color: 0x7e1206, roughness: 0.30, metalness: 0.05,
          clearcoat: 1.0, clearcoatRoughness: 0.10,
          bumpMap: bo, bumpScale: 0.045,
          emissive: 0x2a0503, emissiveIntensity: 0.55,
        });
        mats[k] = novo;
        matsE[k].color.set(0x3a0803);
      } else if (nome === 'wing_material') {
        mats[k] = new THREE.MeshPhysicalMaterial({
          color: 0xd8e4f2, roughness: 0.06, metalness: 0.0,
          transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false,
          bumpMap: asa.bump, bumpScale: 0.02,
          alphaMap: asa.alfa,
          iridescence: 1.0, iridescenceIOR: 1.32, iridescenceThicknessRange: [120, 520],
          sheen: 0.6, sheenColor: new THREE.Color(0x9fd6ff),
        });
      } else if (nome.startsWith('tarsus') || nome.startsWith('tibia') || nome.startsWith('femur') || nome.startsWith('coxa')) {
        // perna: era translucida (alfa 0,5-0,8) e parecia fantasma
        m.transparent = false; m.opacity = 1.0;
        m.roughness = 0.52; m.metalness = 0.18;
        m.bumpMap = bq; m.bumpScale = 0.012;
        m.envMapIntensity = 0.7;
        matsE[k].opacity = 0.16;
      } else if (nome === 'haltere_material' || nome === 'proboscis_material' || nome === 'antenna_material') {
        m.transparent = false; m.opacity = 1.0;
        m.roughness = 0.62; m.metalness = 0.10;
        m.bumpMap = bq; m.bumpScale = 0.010;
        m.envMapIntensity = 0.6;
      } else if (nome === 'arista_material') {
        m.roughness = 0.8; m.metalness = 0.0;
      } else {
        // quitina do torax, da cabeca e dos aneis do abdomen
        m.roughness = 0.34; m.metalness = 0.30;
        m.bumpMap = bq; m.bumpScale = 0.016;
        m.envMapIntensity = 1.15;
        if (d.rgba && d.rgba[3] >= 0.999) { m.transparent = false; m.opacity = 1.0; }
      }
      if (mats[k]) mats[k].needsUpdate = true;
      if (matsE[k]) matsE[k].needsUpdate = true;
    }
    return mats;
  }

  return { melhorar, ambiente, bumpQuitina, bumpOlho, texAsa };
})();
