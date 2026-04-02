const API_URL = window.location.origin + '/api/signatures';

const app = {
  signatures: [],
  signSide: 'front',
  currentX: null,
  currentY: null,
  pad: null,
  inkColor: '#1a1a2e',
  
  searchMatches: [],
  currentMatchIndex: 0,
  
  fakePool: [],

  async init() {
    await this.loadData();
    this.generateFakeSignaturesPool();
    this.setupRouter();
    this.setupCanvas();
    this.renderWall();
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    
    toast.innerHTML = `<span>${message}</span>`;
    
    container.appendChild(toast);
    
    // trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  },

  showModal({ icon = 'ℹ', title, message, confirmText = 'OK', onConfirm }) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerText = icon;
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    
    confirmBtn.innerText = confirmText;
    cancelBtn.classList.add('hidden');
    
    confirmBtn.onclick = () => {
      overlay.classList.add('hidden');
      if (onConfirm) onConfirm();
    };
    
    overlay.classList.remove('hidden');
  },

  async loadData() {
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      this.signatures = data.signatures || []; 
      
      const ownerDisplay = document.getElementById('owner-display');
      if (ownerDisplay) {
        ownerDisplay.innerText = data.ownerName;
      }
    } catch (err) {
      console.error("cannot connect to Server:", err);
      this.signatures = [];
    }
  },

  async saveData(newSig) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSig)
      });
      const data = await res.json();
      if(data.success) {
        this.signatures.push(data.newSig); 
      }
    } catch (err) {
      console.error("cannot save:", err);
      this.showToast("Lỗi kết nối GitHub, thử lại nhé!", "error");
      throw err; 
    }
  },

  setupCanvas() {
    const canvas = document.getElementById('sig-canvas');
    
    this.handleCanvasScaling(canvas);

    this.pad = new SignaturePad(canvas, {
      penColor: this.inkColor,
      minWidth: 2, 
      maxWidth: 5,
      velocityFilterWeight: 0.7
    });

    const preventScroll = (e) => {
      e.preventDefault();
    };
    canvas.addEventListener('touchstart', preventScroll, { passive: false });
    canvas.addEventListener('touchmove', preventScroll, { passive: false });
    canvas.addEventListener('touchend', preventScroll, { passive: false });

    document.getElementById('clear-btn').addEventListener('click', () => {
      this.pad.clear();
      document.querySelector('.canvas-placeholder').style.display = 'block';
    });

    this.pad.addEventListener("beginStroke", () => {
      document.querySelector('.canvas-placeholder').style.display = 'none';
    });

    window.addEventListener('resize', () => {
      if(location.hash !== '#/wall') this.resizeCanvas();
    });
  },

  handleCanvasScaling(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    
    // Set kích thước pixel thực tế
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    
    // Reset lại scale và set transform mới để tránh lỗi nhân dồn scale
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset về 1:1
    ctx.scale(ratio, ratio); // Apply scale mới theo màn hình
  },

  resizeCanvas() {
    const canvas = document.getElementById('sig-canvas');
    const data = this.pad ? this.pad.toData() : null; 
    
    this.handleCanvasScaling(canvas);
    
    this.pad.clear();
    if (data && data.length > 0) {
        this.pad.fromData(data);
        document.querySelector('.canvas-placeholder').style.display = 'none';
    } else {
        document.querySelector('.canvas-placeholder').style.display = 'block';
    }
  },

  setColor(color, element) {
    this.inkColor = color;
    this.pad.penColor = color;
    document.querySelectorAll('.preset').forEach(p => p.classList.remove('active'));
    if(element) element.classList.add('active');
  },

  setSignSide(side) {
    this.signSide = side;
    document.querySelectorAll('#sign-view .side-toggle button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.side === side);
    });
    document.getElementById('shirt-collar').style.display = side === 'front' ? 'block' : 'none';
    this.renderPreviewSignatures();
    this.currentX = null;
    this.currentY = null;
    document.getElementById('location-marker').classList.add('hidden');
  },

  pickLocation(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    this.currentX = (e.clientX - rect.left) / rect.width;
    this.currentY = (e.clientY - rect.top) / rect.height;

    const marker = document.getElementById('location-marker');
    marker.style.left = `${this.currentX * 100}%`;
    marker.style.top = `${this.currentY * 100}%`;
    marker.classList.remove('hidden');
  },

  trimCanvas() {
    const canvas = document.getElementById('sig-canvas');
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const l = pixels.data.length;
    let i, bound = { top: null, left: null, right: null, bottom: null }, x, y;

    for (i = 0; i < l; i += 4) {
      if (pixels.data[i + 3] !== 0) {
        x = (i / 4) % canvas.width;
        y = ~~((i / 4) / canvas.width);
        if (bound.top === null) bound.top = y;
        if (bound.left === null) bound.left = x; else if (x < bound.left) bound.left = x;
        if (bound.right === null) bound.right = x; else if (bound.right < x) bound.right = x;
        if (bound.bottom === null) bound.bottom = y; else if (bound.bottom < y) bound.bottom = y;
      }
    }
    
    if(bound.top === null) return null;

    const trimHeight = bound.bottom - bound.top + 20;
    const trimWidth = bound.right - bound.left + 20;
    const trimmed = document.createElement('canvas');
    trimmed.width = trimWidth;
    trimmed.height = trimHeight;
    trimmed.getContext('2d').putImageData(ctx.getImageData(Math.max(0, bound.left - 10), Math.max(0, bound.top - 10), trimWidth, trimHeight), 0, 0);
    
    return trimmed.toDataURL('image/png');
  },

  async submitSignature() {
    const nameInput = document.getElementById('signer-name');
    const name = nameInput.value.trim();

    if (!name) return this.showToast("Bạn quên nhập tên kìa!", "error");
    if (this.pad.isEmpty()) return this.showToast("Bạn chưa ký tên lên bảng kìa!", "error");

    const finalSignatureImage = this.trimCanvas();
    if(!finalSignatureImage) return this.showToast("Bút bị khô mực rùi, bạn ký lại nhé!", "error");

    let x, y;
    if (this.currentX !== null && this.currentY !== null) {
      x = this.currentX;
      y = this.currentY;
    } else {
      let larping = true;
      let attempts = 0;
      while (larping && attempts < 100) {
        // Mở rộng vùng random để sử dụng tối đa diện tích áo
        x = 0.2 + Math.random() * 0.6;
        y = 0.15 + Math.random() * 0.75;
        
        larping = this.signatures.some(sig => {
          if (sig.side !== this.signSide) return false;
          // Giảm khoảng cách va chạm để nhét vừa nhiều người
          const dx = Math.abs(sig.x - x) < 0.12; 
          const dy = Math.abs(sig.y - y) < 0.08; 
          return dx && dy;
        });
        attempts++;
      }
    }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerText = "Đang lưu...";
    submitBtn.disabled = true;

    const newSig = {
      id: Date.now().toString(),
      name: name,
      signature: finalSignatureImage,
      color: this.inkColor,
      side: this.signSide,
      x: x,
      y: y,
      createdAt: Date.now()
    };

    try {
        await this.saveData(newSig);
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });

        nameInput.value = '';
        this.pad.clear();
        document.querySelector('.canvas-placeholder').style.display = 'block';
        this.currentX = null;
        this.currentY = null;
        document.getElementById('location-marker').classList.add('hidden');
        
        this.showToast('Bạn đã ký thành công! Đang chuyển trang...', 'success');
        setTimeout(() => location.hash = '#/wall', 1500);
    } catch(e) {
      this.showToast('Lưu thất bại, hãy thử bấm lưu lại nhé!', 'error');
      console.error("Lỗi khi submit:", e);
    } finally {
      submitBtn.innerText = "LƯU LẠI BÚT TÍCH";
      submitBtn.disabled = false;
    }
  },

  // === ROUTER ===
  setupRouter() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },

  handleRoute() {
    const hash = location.hash || '#/wall';
    document.getElementById('sign-view').classList.add('hidden');
    document.getElementById('wall-view').classList.add('hidden');
    if (hash === '#/wall') {
      document.getElementById('wall-view').classList.remove('hidden');
      this.renderWall();
    } else {
      const randomSide = Math.random() > 0.5 ? 'front' : 'back';
      this.setSignSide(randomSide);
      document.getElementById('sign-view').classList.remove('hidden');
      setTimeout(() => this.resizeCanvas(), 50);
      this.renderPreviewSignatures();
    }
  },

  // === RENDER LOGIC ===
  renderPreviewSignatures() {
    this.buildSignaturesDOM(document.getElementById('preview-signatures'), this.signSide, this.signatures);
  },

  renderWall() {
    document.getElementById('sig-count').innerText = this.signatures.length;
    this.buildSignaturesDOM(document.getElementById('wall-signatures-front'), 'front', this.signatures);
    this.buildSignaturesDOM(document.getElementById('wall-signatures-back'), 'back', this.signatures);
    this.buildAnimatedBackground();
  },

  buildSignaturesDOM(container, side, dataList) {
    if(!container) return;
    container.innerHTML = '';
    dataList.filter(s => s.side === side).forEach(sig => {
      const wrapper = document.createElement('div');
      wrapper.className = 'sig-wrapper';
      wrapper.id = `sig-${sig.id}`;
      wrapper.style.left = `${sig.x * 100}%`;
      wrapper.style.top = `${sig.y * 100}%`;

      wrapper.setAttribute('data-tooltip', `${sig.name} — ${this.formatDateTime(sig.createdAt)}`);

      const img = document.createElement('img');
      img.src = sig.signature;
      img.className = 'sig-img';
      img.style.transform = `rotate(${(parseInt(sig.id.slice(-4)) % 30) - 15}deg)`;

      wrapper.appendChild(img);
      
      wrapper.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.sig-wrapper').forEach(w => w.classList.remove('force-tooltip'));
          wrapper.classList.add('force-tooltip');
      });

      container.appendChild(wrapper);
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.sig-wrapper').forEach(w => w.classList.remove('force-tooltip'));
    });
  },

  // === SEARCH & DUPLICATES ===
  searchSignature() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    
    document.querySelectorAll('.sig-wrapper').forEach(el => { 
      el.classList.remove('highlight', 'active-match'); 
      el.querySelector('.highlight-badge')?.remove(); 
    });
    document.getElementById('search-nav-ui').classList.add('hidden');

    if (!query) return;
    
    this.searchMatches = this.signatures.filter(s => s.name.toLowerCase().includes(query));
    
    if (this.searchMatches.length > 0) {
      this.currentMatchIndex = 0;
      
      this.searchMatches.forEach((target, index) => {
        const sigEl = document.getElementById(`sig-${target.id}`);
        if (sigEl) {
          sigEl.classList.add('highlight');
          const badge = document.createElement('div');
          badge.className = 'highlight-badge';
          badge.innerText = `${target.name} #${index + 1}`;
          sigEl.appendChild(badge);
        }
      });

      document.getElementById('search-badge-text').innerText = `Tìm thấy ${this.searchMatches.length} chữ ký của "${query}" 👇`;
      document.getElementById('search-nav-ui').classList.remove('hidden');

      this.focusMatch(0);
    } else {
      this.showToast("Chưa thấy tên này, hãy nhấn 'Ký áo' để ký nhé!", "info");
    }
  },

  cycleSearch(direction) {
    if (this.searchMatches.length === 0) return;
    this.currentMatchIndex += direction;
    if (this.currentMatchIndex < 0) this.currentMatchIndex = this.searchMatches.length - 1;
    if (this.currentMatchIndex >= this.searchMatches.length) this.currentMatchIndex = 0;
    this.focusMatch(this.currentMatchIndex);
  },

  focusMatch(index) {
    document.querySelectorAll('.sig-wrapper.highlight').forEach(el => el.classList.remove('active-match'));
    
    const target = this.searchMatches[index];
    const sigEl = document.getElementById(`sig-${target.id}`);
    if (sigEl) {
      sigEl.classList.add('active-match');
      sigEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  // === BACKGROUND ANIMATION ===
  seededRandom(seed) {
    return function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }
  },

  generateFakeSignaturesPool() {
    const colors = ['#1a1a2e', '#8b0000', '#2c4a7c', '#3d2b1f'];
    for(let i=0; i<50; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 80;
      const ctx = canvas.getContext('2d');
      const rng = this.seededRandom(1000 + i);

      ctx.strokeStyle = colors[Math.floor(rng() * colors.length)];
      ctx.lineWidth = 2 + rng() * 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.moveTo(10 + rng()*30, 40 + rng()*20 - 10);
        ctx.bezierCurveTo(
          50+rng()*40, rng()*60+10,
          100+rng()*40, rng()*60+10,
          160+rng()*30, 40+rng()*20-10
        );
        ctx.stroke();
      }
      this.fakePool.push(canvas.toDataURL('image/png'));
    }
  },

  buildAnimatedBackground() {
    const bgContainer = document.getElementById('wall-bg-animation');
    if(bgContainer.innerHTML.trim() !== '') return; 
    if (this.fakePool.length === 0) this.generateFakeSignaturesPool();
    const screenWidth = window.innerWidth;
    const colCount = Math.floor(screenWidth / 130) + 1; 
    
    const realSig = this.signatures.map(s => s.signature);
    const fakeSig = this.fakePool;

    const ratio = 0.7; 

    realSig.sort(() => Math.random() - 0.5);

    for (let i = 0; i < colCount; i++) {
      const col = document.createElement('div');
      col.className = `bg-column ${i % 2 === 0 ? 'scroll-up' : 'scroll-down'}`;
      
      const speed = 20 + Math.random() * 10;
      col.style.animationDuration = `${speed}s`;

      let innerHTML = '';
      const itemsPerCol = 10;
      
      const buildBoxes = () => {
        for(let j=0; j<itemsPerCol; j++) {
           let imgSrc;
           if (realSig.length > 0 && Math.random() < ratio) {
               imgSrc = realSig[Math.floor(Math.random() * realSig.length)];
           } else {
               imgSrc = fakeSig[Math.floor(Math.random() * fakeSig.length)];
           }
           
           innerHTML += `<div class="fake-sig-box"><img src="${imgSrc}" alt="sig"></div>`;
        }
      };
      
      buildBoxes();
      buildBoxes(); 

      col.innerHTML = innerHTML;
      bgContainer.appendChild(col);
    }
  },

  // === UTILS ===
  formatDateTime(dateStr) {
    const d = new Date(dateStr);
    const pad = n => n < 10 ? '0'+n : n;
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} lúc ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});