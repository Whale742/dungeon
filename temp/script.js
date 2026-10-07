/**
 * Dungeon Abyss — Presentation Lab Engine
 * 架構遵循：Gameplay Result 與 Presentation 分離，Client 依 Timeline Beat 執行。
 */

// ==========================================
// 1. 角色貼圖資產
// ==========================================
const PORTRAIT_ASSETS = {
    dreamweaver: `
      <svg viewBox="0 0 100 100">
        <polygon points="50,15 85,45 65,85 35,85 15,45" fill="#1e1b38" stroke="#705898" stroke-width="2"/>
        <path d="M50,25 C65,35 75,55 70,75 C60,65 50,70 50,70 C50,70 40,65 30,75 C25,55 35,35 50,25 Z" fill="#2c2250" stroke="#e5c378" stroke-width="1.5"/>
        <polygon points="40,40 50,25 60,40 50,55" fill="none" stroke="#e5c378" stroke-width="1"/>
      </svg>
    `,
    stargazer: `
      <svg viewBox="0 0 100 100">
        <rect x="20" y="20" width="60" height="60" fill="#0d1b2a" stroke="#1f4e5b" stroke-width="2"/>
        <circle cx="50" cy="50" r="28" fill="none" stroke="#4deeea" stroke-dasharray="4,3" stroke-width="1.5"/>
        <line x1="15" y1="50" x2="85" y2="50" stroke="#4deeea" stroke-width="1"/>
        <line x1="50" y1="15" x2="50" y2="85" stroke="#4deeea" stroke-width="1"/>
        <polygon points="50,38 54,46 62,50 54,54 50,62 46,54 38,50 46,46" fill="#ffffff"/>
      </svg>
    `,
    gladiator: `
      <svg viewBox="0 0 100 100">
        <polygon points="50,10 82,30 75,85 25,85 18,30" fill="#2b1a1a" stroke="#9c7a4a" stroke-width="2"/>
        <polygon points="46,12 54,12 54,65 46,65" fill="#8b1e28"/>
        <rect x="30" y="45" width="40" height="8" fill="#111" stroke="#9c7a4a" stroke-width="1.5"/>
        <polygon points="45,60 55,60 52,78 48,78" fill="#9c7a4a"/>
      </svg>
    `,
    boss: `
      <svg viewBox="0 0 100 100">
        <polygon points="50,8 88,25 78,88 22,88 12,25" fill="#1c0d12" stroke="#8b1e28" stroke-width="3"/>
        <polygon points="20,15 35,32 15,40" fill="#8b1e28"/>
        <polygon points="80,15 65,32 85,40" fill="#8b1e28"/>
        <polygon points="32,45 42,50 32,55" fill="#e63946"/>
        <polygon points="68,45 58,50 68,55" fill="#e63946"/>
        <polyline points="35,70 42,75 50,70 58,75 65,70" fill="none" stroke="#e63946" stroke-width="2"/>
      </svg>
    `
  };
  
  // ==========================================
  // 2. 自訂 SVG 夢蝶生成器
  // ==========================================
  function createButterflyNode(x, y, scale = 0.28, angle = 0) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'crystal-butterfly');
    g.setAttribute('transform', `translate(${x}, ${y}) rotate(${angle}) scale(${scale})`);
  
    g.innerHTML = `
      <g transform="translate(-68, -64)">
        <g class="wing-left">
          <path fill="#41484a" d="M68 64 L68 78 l-5.3 2.91 l1.92 12.44 l-.42 3.94 l-.7 2.82 l-1.97 3.94 l-5.07 2.95 l-7.18.15 l-9.29-2.54 l-5.49-4.22 l-3.38-5.63 l.84-7.46 l9.57-12.25 l-8.02 2.95 l-10.28.29 l-8.44-9.16 L8.24 55.83 l-3.23-9.29 l2.67-2.82 h7.74 l16.62 2.68 l18.16 7.18 l13.09 7.46 Z"/>
          <path d="M63.99 60.33s-5.77-5.21-17.46-10.14s-22.1-8.02-31.39-7.88s-10.7 2.25-11.12 3.94c-.42 1.69 1.24 7.02 3.1 10.28c2.25 3.94 10.7 17.6 13.66 21.82c2.55 3.65 4.31 7.7 9.85 9.01c6.15 1.45 13.66-1.69 13.66-1.69s-7.18 6.48-7.6 13.37c-.42 6.9 3.24 11.83 10.84 14.5s18.7 4.72 22.24-3.66c1.03-2.44.84-4.93.84-4.93s-2.56 7.31-6.48 8.02c-3.1.56-2.67-1.27-5.49-1.55c-2.82-.28-2.39 1.83-5.35 1.83c-2.27 0-1.55-1.83-3.94-3.1s-3.75.78-5.21-.42c-2.39-1.97-.14-2.96-1.13-4.5c-.99-1.55-3.26-2.02-3.8-3.94c-.99-3.52.99-6.19 3.1-9.29c2.11-3.1 5.91-7.6 8.87-9.71c2.96-2.11 17.53-9.06 17.53-9.06s.77-2.62-.35-2.48c-1.13.14-14.36 7.18-16.76 8.73c-2.39 1.55-12.74 6.91-20.27 5.21c-4.36-.99-12.23-14.87-15.41-19.19c-3.18-4.32-8.68-14.92-8.24-17.98c.41-2.82 5.21-3.38 12.53-2.53c7.32.84 13.8 3.1 22.95 6.9S62.73 62.73 64 62.73c1.26 0-.01-2.4-.01-2.4z" fill="#676f72"/>
          <path d="M54.84 93.7c-1.75-.87-7.04 4.08-7.04 6.48c0 1.57 1.13 4.22 3.52 3.52c2.4-.71 5.78-8.88 3.52-10z" fill="#be38f3"/>
          <path d="M45.41 93.7c2.25 1.97 5.97-1.95 7.6-4.5c1.97-3.1 2.96-10.84 2.39-10.56c-.56.28-7.6 5.35-7.6 5.35s-5.34 7.13-2.39 9.71z" fill="#be38f3"/>
          <path d="M56.11 103.27c0 2.46 2.67 4.22 5.35 3.8c1.4-.22 3.91-1.52 3.66-3.8c-.28-2.53-1.41-6.34-4.08-6.76c-2.68-.42-4.93 2.68-4.93 6.76z" fill="#be38f3"/>
          <path d="M61.6 75.4s-6.49 10.66-4.5 15.91c1.55 4.08 5.77 3.38 9.43-3.52s4.36-11.26 4.36-11.26l-1.13-3.94l-8.16 2.81z" fill="#be38f3"/>
          <path d="M29.13 75.58c-.2 2.15 1.69 4.88 7.32 4.41s12.3-3.79 14.08-4.6c3.28-1.5 6.29-2.72 6.29-4.22c0-1.69-3.75-2.25-8.82-2.72c-5.07-.47-8.82.47-13.05 2.82c-3.53 1.96-5.73 3.28-5.82 4.31z" fill="#be38f3"/>
          <path d="M23.59 68.17c-.17 1.3 1.97 4.41 3.38 4.5c1.41.09 8.82-3.85 9.01-5.16c.19-1.31-1.69-3.38-3.19-3.75c-1.5-.38-9.01 3-9.2 4.41z" fill="#be38f3"/>
          <path d="M32.79 53.81c-2.26 2.26.38 6.48 5.26 8.92c4.88 2.44 12.67 3.1 15.77 3.57c3.1.47 5.35.56 5.82-.38c1.01-2.01-6.48-5.73-13.42-9.01c-4.33-2.05-11.65-4.88-13.43-3.1z" fill="#be38f3"/>
          <path d="M10.73 49.21c.28 2.82 7.79 2.1 7.88-.66c.1-2.72-8.16-2.15-7.88.66z" fill="#be38f3"/>
          <path d="M15.61 55.78c1.17 1.95 6.01.19 4.41-2.35c-1.52-2.41-6.1-.46-4.41 2.35z" fill="#be38f3"/>
          <path d="M20.87 63.57c.77 1.31 3.33 1.22 5.73.09c1.6-.75 3.7-2.29 3.28-4.13c-.47-2.06-4.32-2.35-6.85-1.13c-1.79.87-3.76 2.45-2.16 5.17z" fill="#be38f3"/>
          <ellipse cx="20.74" cy="72.3" rx="1.87" ry="1.9" fill="#fcfdfa"/>
          <path d="M10 45.97c.83 1.11.18 2.35-.86 3.2c-1.03.85-2.45.83-3.16-.04s-.45-2.27.59-3.12c1.04-.85 2.62-1.14 3.43-.04z" fill="#fcfdfa"/>
          <path d="M16.74 60.88c1.42.28 1.81 1.53 1.62 2.74c-.19 1.22-1.28 2.06-2.44 1.88c-1.16-.18-1.95-1.31-1.77-2.53s1.19-2.36 2.59-2.09z" fill="#fcfdfa"/>
          <path d="M12.46 53.78c1.03 1.02.66 2.27-.17 3.18c-.83.91-2.2 1.01-3.07.21c-.87-.79-.9-2.17-.07-3.08c.83-.91 2.3-1.32 3.31-.31z" fill="#fcfdfa"/>
          <path d="M29.77 49.61c1.04.82.74 2.14-.02 3.2s-2.08 1.42-2.96.8s-.97-1.99-.21-3.06c.76-1.06 2.16-1.75 3.19-.94z" fill="#fcfdfa"/>
          <path d="M26.55 48.97c-.04 1.36-1.31 1.92-2.64 1.93c-1.33.02-2.42-.87-2.43-1.97c-.01-1.11 1.05-2.02 2.38-2.03c1.33-.02 2.73.72 2.69 2.07z" fill="#fcfdfa"/>
          <path d="M43.86 99.19c0 1.23-.78 2.22-2.01 2.22s-2.22-1-2.22-2.24c0-1.23.99-2.24 2.22-2.24s2.01 1.02 2.01 2.26z" fill="#fcfdfa"/>
          <path d="M47.59 107.07c-.8.95-2.44.81-3.28.11c-.83-.7-.86-2.04-.06-2.99s2.12-1.16 2.96-.46c.83.7 1.18 2.39.38 3.34z" fill="#fcfdfa"/>
        </g>
        <g class="wing-right">
          <path fill="#41484a" d="M68 64 L71.08 63.95 l4.69-9.39 l10.51-13.51 L99.8 31.1 l13.51-6.2 l7.28-.18 l1.83 2.81 l-3.1 14.22 l-4.93 20.98 l-3.09 5.06 l-7.32 4.09 L96.51 73 l7.61 3.52 l5.63 4.37 l3.23 4.5 v6.06 l-2.81 7.88 l-8.45 6.76 l-5.21 1.97 l-8.16-1.97 l-1.83-2.11 l-3.9-6.2 l-2.72-9.29 l-5.49-2.82 L68 78 Z"/>
          <path d="M72.58 62.02s-1.13-2.72.84-6.1s8.31-12.9 14.78-18.68c6.48-5.77 28.3-17.74 33.22-14.22c4.93 3.52-.42 17.36-1.55 22.1c-.98 4.13-2.25 17.41-7.04 22.95c-3.72 4.31-11.68 5.77-11.68 5.77s12.94 6.21 13.51 14.36c.7 10-10.98 21.42-19.71 21.12c-6.71-.23-8.45-5.35-8.45-5.35s6.19 3.52 8.73 2.82c2.53-.7.7-3.1 3.1-4.5s4.36 2.25 6.19.56s.42-3.24 1.69-4.93c1.27-1.69 3.1 0 4.22-1.55c1.13-1.55 0-3.66.56-5.07c.56-1.41 1.69-1.69 1.55-3.8c-.14-2.11-4.08-7.04-9.01-9.43s-10.28-3.52-14.64-4.36c-4.36-.84-15.63-1.6-15.63-1.6s-.99-2.3-.42-2.21c1.13.19 3.94.42 8.17.56c8.54.28 22.24 2.25 28.3-2.53s7.04-18.3 7.6-21.82s5.91-19.01 2.82-20.55c-3.1-1.55-18.34 4.61-26.7 11.07s-14.4 15.4-16.23 19.06c-1.83 3.66-4.22 6.33-4.22 6.33z" fill="#676f72"/>
          <path d="M71.01 83.91s-3.69 7.75-4.49 9.64c-1.13 2.67-1.17 9.34 1.83 10.42c2.14.77 2.67-2.96 2.67-2.96s.37-7.64.37-10.17c.01-2.53-.38-6.93-.38-6.93z" fill="#be38f3"/>
          <path d="M73.85 75.12s7.04 8.17 9.15 9.71c2.11 1.55 5.77 5.91 10.56 2.67c4.79-3.24-8.17-14.08-9.29-14.92C83.14 71.74 73 71.6 73 71.6l.85 3.52z" fill="#be38f3"/>
          <path d="M76.38 83s4.92 4.49 5.91 5.49c2.11 2.11 4.5 4.07 5.49 7.04c.56 1.69 1.41 4.22-.42 5.21c-1.51.81-3.4-1.39-4.08-2.11c-.69-.72-3.33-6.53-4.87-9.84c-.64-1.36-2.03-5.79-2.03-5.79z" fill="#be38f3"/>
          <path d="M90.74 91.45c-1.13 1.52.32 6.76 1.83 7.74c2.82 1.83 6.19-1.41 6.19-2.96c.01-1.55-5.63-8.02-8.02-4.78z" fill="#be38f3"/>
          <path d="M88.91 72.02s6.19 9.71 9.57 11.68s6.04 1.75 7.04 0c2.25-3.94-7.46-9.29-7.46-9.29l-9.15-2.39z" fill="#be38f3"/>
          <path d="M96.65 87.22c-.84 1.83 2.67 7.18 5.07 7.18s3.26-3.39 3.1-4.5c-.28-1.97-6.73-5.8-8.17-2.68z" fill="#be38f3"/>
          <path d="M95.2 43.49c-3.49-1.45-7.13.47-11.26 6.38s-6.38 10.04-4.6 11.54s10-6.16 11.73-7.51c2.53-1.97 7.98-8.82 4.13-10.41z" fill="#be38f3"/>
          <path d="M88.16 60c2.32-1.32 9.1-.75 12.76-.94c2.44-.13 6.01.25 6.1 1.5c.19 2.53-.75 4.13-3.94 5.26s-10.7 1.31-15.49 1.41c-2.82.06-5.41.34-5.73-.94c-.18-.75 2.17-3.94 6.3-6.29z" fill="#be38f3"/>
          <path d="M99.24 48.93c2.16.38 9.1.19 11.07-1.31c1.2-.92 1.88-4.79 0-5.63c-1.88-.84-7.23-.66-9.29.94c-1.27.97-3.62 5.68-1.78 6z" fill="#be38f3"/>
          <path d="M109.47 31.29c-.36 2.21 3.19 2.16 4.79 1.69c1.6-.47 3.75-3 2.72-4.32c-1.04-1.32-7.05-.28-7.51 2.63z" fill="#be38f3"/>
          <path d="M106.93 36.73c0 1.6 1.31 2.16 3.19 2.16s3.1-1.19 3.1-2.44c0-1.69-1.6-2.35-3.66-1.97c-1.57.28-2.63.94-2.63 2.25z" fill="#be38f3"/>
          <path d="M94.36 56.16c0 1.2 3.38.84 8.26.84s6.01-.75 6.57-2.63c.56-1.88.38-3.1-2.53-3.19c-2.91-.09-8.63.19-10.32 1.41c-.77.55-1.98 2.63-1.98 3.57z" fill="#be38f3"/>
          <ellipse transform="rotate(-33.726 95.108 38.234)" cx="95.11" cy="38.23" rx="2.75" ry="2.18" fill="#fcfdfa"/>
          <path d="M117.21 41.47c-.63-1.03-2.01-1.26-3.17-.28c-.79.66-1.44 2.24-.77 3.24c.67 1 2.14 1.12 3.1.35c1.18-.95 1.41-2.37.84-3.31z" fill="#fcfdfa"/>
          <path d="M104.33 35.13c-.67-1-2.47-1.12-3.73-.28s-2.21 2.41-1.2 3.94c.7 1.06 2.31 1.04 3.87.14c1.48-.84 1.73-2.79 1.06-3.8z" fill="#fcfdfa"/>
          <path d="M121.22 26.05c0 1.09-.7 2.18-2.18 1.97c-1.35-.19-1.97-.7-1.97-2.18c0-1.09 1.04-1.76 2.15-1.76s2 .88 2 1.97z" fill="#fcfdfa"/>
          <path d="M119.53 34.64c0 1.09-1.08 2.04-2.18 1.97c-1.06-.07-1.97-.7-1.97-2.18c0-1.09 1.07-1.9 2.18-1.9s1.97 1.02 1.97 2.11z" fill="#fcfdfa"/>
          <circle cx="113.79" cy="53.68" r="2.15" fill="#fcfdfa"/>
          <ellipse transform="rotate(-33.973 107.471 93.774)" cx="107.46" cy="93.77" rx="2.08" ry="1.76" fill="#fcfdfa"/>
          <ellipse transform="rotate(-33.973 109.79 87.148)" cx="109.78" cy="87.14" rx="2.08" ry="2" fill="#fcfdfa"/>
        </g>
        <g class="butterfly-body">
          <path d="M67.02 46.26s1.23-11.63 2.53-16.19c1.83-6.41 7.04-11.47 11.4-11.97c4.36-.49 3.8 2.89 1.13 4.29c-2.57 1.35-5.35.56-5.35.56s-3.59 2.62-4.79 8.02c-1.41 6.34-2.53 16.19-2.53 16.19l-2.39-.9z" fill="#676f72"/>
          <path d="M63.15 47.03s-4.77-9.69-9.92-15.84c-5.14-6.12-11.68-6.34-12.6-6.41c-.92-.07-4.79.56-4.79 2.39c0 2.46 3.4 2.9 5.35 2.53c2.25-.42 3.31-1.76 3.31-1.76s4.18 1.66 6.97 5c3.24 3.87 9.22 15.56 9.22 15.56l.42 1.55l2.04-3.02z" fill="#676f72"/>
          <path d="M72.41 58.68c.77-1.06 1.95-1.89 1.44-7.07c-.56-5.7-5.46-7.14-9.33-6.3c-3.14.68-7.57 3.63-5.17 10.73c2.12 6.31 9.29 4.36 9.29 4.36s2.99-.67 3.77-1.72z" fill="#41484a"/>
          <path d="M67.23 56.67c-2.19.61-3.83 1.97-3.94 4.36c-.14 3.1.56 4.93 1.41 7.88c.54 1.89 1.17 6.22 6.9 4.79c3.94-.99 3.52-4.65 3.38-7.32c-.14-2.69-.7-6.19-1.69-7.74c-.92-1.44-3.52-2.67-6.06-1.97z" fill="#303031"/>
          <path d="M72.54 47.42c.87 1.29.9 3.07-.24 3.83c-1.13.76-3 .22-3.87-1.07c-.87-1.29-.65-2.95.48-3.72c1.14-.76 2.76-.33 3.63.96z" fill="#303031"/>
          <path d="M63.3 51.58c-.42 1.5-1.86 2.58-3.17 2.21c-1.32-.37-2.01-2.03-1.6-3.53c.42-1.5 1.82-2.42 3.14-2.05s2.04 1.87 1.63 3.37z" fill="#303031"/>
          <path d="M74.06 71.24L67.79 73s1.94 8.4 2.67 11.54c.77 3.31 5.7 27.17 9.57 26.54c3.99-.65-2.67-25.34-3.31-28.02c-.6-2.57-2.66-11.82-2.66-11.82z" fill="#676f72"/>
          <path d="M73.43 82.51c1.85-.4 2.87-1.51 2.87-1.51l1.23 5.3s-.93.86-2.76 1.28c-2.02.47-3.59.11-3.59.11l-1.21-5.26c-.01-.01 1.48.5 3.46.08z" fill="#41484a"/>
          <path d="M67.79 73l6.26-1.76l.93 4.22s-1.65.83-2.99 1.11c-1.34.28-3.31.3-3.31.3L67.79 73z" fill="#41484a"/>
          <path d="M72.3 92.5s1.78.21 3.4-.14c1.62-.35 2.97-1.39 2.97-1.39l1.04 4.66s-1.54 1.09-2.95 1.35c-1.45.27-3.28.11-3.26.11l-1.2-4.59z" fill="#41484a"/>
        </g>
      </g>
    `;
    return g;
  }
  
  // ==========================================
  // 3. 自訂羅馬短劍 (Gladius) SVG 節點生成器[cite: 6]
  // ==========================================
  function createGladiusNode(scale = 0.58) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'gladius-blade');
    
    g.innerHTML = `
      <g transform="scale(${scale}) translate(-50, -50)">
        <circle cx="15" cy="85" r="7.5" fill="#9c7a4a" stroke="#e5c378" stroke-width="1.8"/>
        <polygon points="19,81 27,73 23,69 15,77" fill="#1b120c" stroke="#9c7a4a" stroke-width="1.6"/>
        <path d="M 23,70 C 23,58 35,46 45,58 L 32,71 Z" fill="#9c7a4a" stroke="#e5c378" stroke-width="1.8"/>
        <path d="M 36,54 C 48,42 62,28 78,14 C 92,6 96,8 96,8 C 96,8 94,22 86,36 C 72,52 58,66 46,74 Z" 
              fill="#e2e8f0" stroke="#9c7a4a" stroke-width="2.2"/>
        <path d="M 38,57 L 96,8" stroke="#718096" stroke-width="1.6"/>
      </g>
    `;
    return g;
  }
  
  // ==========================================
  // 4. 動態 U 字形絲線生成輔助函式
  // ==========================================
  function getTwistedUPath(x1, y1, x2, y2, step, phaseOffset) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    
    const nx = -dy / (dist || 1);
    const ny = dx / (dist || 1);
  
    const sag = 65 + Math.min(dist * 0.45, 90);
  
    const t = step * 0.35 + phaseOffset;
    const twist1 = Math.sin(t) * 32;
    const twist2 = Math.cos(t * 1.35 + 1.1) * 32;
  
    const cp1x = x1 + dx * 0.25 + nx * twist1;
    const cp1y = y1 + dy * 0.25 + ny * twist1 + sag;
  
    const cp2x = x1 + dx * 0.75 + nx * twist2;
    const cp2y = y1 + dy * 0.75 + ny * twist2 + sag;
  
    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  }
  
  // ==========================================
  // 5. 橢圓星軌座標與長曝光光弧計算器
  // ==========================================
  function getOrbitPos(rx, ry, tiltDeg, angle) {
    const rad = (tiltDeg * Math.PI) / 180;
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    return {
      x: x * Math.cos(rad) - y * Math.sin(rad),
      y: x * Math.sin(rad) + y * Math.cos(rad)
    };
  }
  
  function generateArcPath(rx, ry, tiltDeg, curAngle, trailSpan) {
    let d = '';
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const a = curAngle - trailSpan * (1 - i / steps);
      const p = getOrbitPos(rx, ry, tiltDeg, a);
      d += (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
    }
    return d;
  }
  
  // ==========================================
  // 6. 音效合成系統
  // ==========================================
  class SfxSystem {
    constructor() { this.ctx = null; }
    _init() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    play(type) {
      this._init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
  
      switch (type) {
        case 'flutter':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(500, now);
          osc.frequency.exponentialRampToValueAtTime(1100, now + 0.18);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.18);
          osc.start(now); osc.stop(now + 0.18);
          break;
        case 'snap':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(950, now);
          osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.08);
          osc.start(now); osc.stop(now + 0.08);
          break;
        case 'slash':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1200, now);
          osc.frequency.exponentialRampToValueAtTime(250, now + 0.12);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.12);
          osc.start(now); osc.stop(now + 0.12);
          break;
        case 'heavy_impact':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(170, now);
          osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
          gain.gain.setValueAtTime(0.5, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.4);
          osc.start(now); osc.stop(now + 0.4);
          break;
        case 'focus':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.exponentialRampToValueAtTime(750, now + 0.4);
          gain.gain.setValueAtTime(0.09, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.4);
          osc.start(now); osc.stop(now + 0.4);
          break;
        case 'blade_spin':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(350, now);
          osc.frequency.exponentialRampToValueAtTime(650, now + 0.35);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.35);
          osc.start(now); osc.stop(now + 0.35);
          break;
        case 'overload_glitch':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(250, now);
          osc.frequency.linearRampToValueAtTime(900, now + 0.08);
          osc.frequency.linearRampToValueAtTime(180, now + 0.25);
          gain.gain.setValueAtTime(0.35, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.25);
          osc.start(now); osc.stop(now + 0.25);
          break;
        case 'whiff_drop':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.exponentialRampToValueAtTime(70, now + 0.45);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.45);
          osc.start(now); osc.stop(now + 0.45);
          break;
        case 'barrier_hit':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(280, now);
          osc.frequency.exponentialRampToValueAtTime(60, now + 0.5);
          gain.gain.setValueAtTime(0.4, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.5);
          osc.start(now); osc.stop(now + 0.5);
          break;
      }
    }
  }
  const sfx = new SfxSystem();
  
  // ==========================================
  // 7. 播放控制器
  // ==========================================
  class PresentationTimeline {
    constructor(speed = 0.5) {
      this.speed = speed;
      this.isPaused = false;
      this.isAborted = false;
      this._resumeResolver = null;
    }
  
    async wait(ms) {
      let remaining = ms / this.speed;
      while (remaining > 0) {
        if (this.isAborted) throw new Error('ABORTED');
        if (this.isPaused) await new Promise(res => { this._resumeResolver = res; });
        const step = Math.min(remaining, 25);
        await new Promise(res => setTimeout(res, step));
        if (!this.isPaused) remaining -= step;
      }
    }
  
    sec(baseSeconds) {
      return (baseSeconds / this.speed).toFixed(3) + 's';
    }
  
    ms(baseMs) {
      return baseMs / this.speed;
    }
  
    pause() { this.isPaused = true; }
    resume() {
      if (this.isPaused) {
        this.isPaused = false;
        if (this._resumeResolver) {
          this._resumeResolver();
          this._resumeResolver = null;
        }
      }
    }
    abort() {
      this.isAborted = true;
      this.resume();
    }
  }
  
  // ==========================================
  // 8. 舞台 DOM 映射與公用方法
  // ==========================================
  const fx = document.getElementById('fxOverlay');
  const strip = document.getElementById('actionStrip');
  const skillName = document.getElementById('skillName');
  const actorPos = document.getElementById('actorPos');
  const actorHit = document.getElementById('actorHit');
  const actorPortrait = document.getElementById('actorPortrait');
  const actorName = document.getElementById('actorName');
  const actorHp = document.getElementById('actorHp');
  const actorStatus = document.getElementById('actorStatus');
  const targetUnit = document.getElementById('targetUnit');
  const targetPos = document.getElementById('targetPos');
  const targetHit = document.getElementById('targetHit');
  const targetPortrait = document.getElementById('targetPortrait');
  const targetHp = document.getElementById('targetHp');
  const targetStatus = document.getElementById('targetStatus');
  
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const btnPlay = document.getElementById('btnPlay');
  const btnPause = document.getElementById('btnPause');
  const speedSelect = document.getElementById('speedSelect');
  
  let currentTimeline = null;
  
  function setPlaybackState(state) {
    if (state === 'playing') {
      statusDot.className = 'status-dot active';
      statusText.innerText = '播放中';
      btnPlay.disabled = true;
      btnPause.disabled = false;
    } else if (state === 'paused') {
      statusDot.className = 'status-dot paused';
      statusText.innerText = '已暫停';
      btnPlay.disabled = false;
      btnPause.disabled = true;
    } else {
      statusDot.className = 'status-dot';
      statusText.innerText = '待命';
      btnPlay.disabled = false;
      btnPause.disabled = true;
    }
  }
  
  function resetStageElements() {
    if (currentTimeline) {
      currentTimeline.abort();
      currentTimeline = null;
    }
    fx.innerHTML = '';
    strip.classList.remove('active');
    skillName.classList.remove('active');
    actorPos.style.transform = '';
    actorHit.className = 'hit-wrapper';
    actorPortrait.style.filter = '';
    actorHp.style.width = '100%';
    actorStatus.style.opacity = '0';
    targetPos.style.transform = '';
    targetHit.className = 'hit-wrapper';
    targetHit.style.transform = '';
    targetHp.style.width = '100%';
    targetStatus.style.opacity = '0';
    targetUnit.style.display = 'flex';
    document.querySelectorAll('.damage-popup').forEach(el => el.remove());
    setPlaybackState('idle');
  }
  
  function getStageCenter() {
    const root = document.getElementById('presentationRoot');
    const rect = root.getBoundingClientRect();
    fx.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    return { cx: rect.width / 2, cy: rect.height / 2 };
  }
  
  function getCenter(el) {
    const r = el.getBoundingClientRect();
    const root = document.getElementById('presentationRoot').getBoundingClientRect();
    return { x: r.left + r.width / 2 - root.left, y: r.top + r.height / 2 - root.top };
  }
  
  function showDamage(x, y, text, type = 'normal') {
    const el = document.createElement('div');
    el.className = `damage-popup ${type}`;
    el.innerText = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.getElementById('presentationRoot').appendChild(el);
    setTimeout(() => {
      el.style.transform = 'translateY(-30px)';
      el.style.opacity = '0';
    }, 20);
    setTimeout(() => el.remove(), 600);
  }
  
  function syncWingSpeed() {
    const speed = parseFloat(speedSelect.value) || 0.5;
    const baseFlap = 0.18;
    document.documentElement.style.setProperty('--wing-speed', (baseFlap / speed).toFixed(3) + 's');
  }
  
  function getAmbientStarsMarkup() {
    const starPositions = [
      { x: -250, y: -120, s: 0.8, op: 0.5 },
      { x: -190, y: 110,  s: 0.6, op: 0.6 },
      { x: -280, y: 10,   s: 1.0, op: 0.8 },
      { x: -140, y: -160, s: 0.5, op: 0.4 },
      { x: 240,  y: -130, s: 0.8, op: 0.5 },
      { x: 280,  y: 40,   s: 0.9, op: 0.7 },
      { x: 190,  y: 130,  s: 0.6, op: 0.6 },
      { x: 150,  y: -160, s: 0.5, op: 0.4 },
      { x: -90,  y: 170,  s: 0.7, op: 0.6 },
      { x: 90,   y: 170,  s: 0.7, op: 0.6 }
    ];
  
    return starPositions.map(p => `
      <polygon class="ambient-star" transform="translate(${p.x}, ${p.y}) scale(${p.s})"
        points="0,-12 3,-3 12,0 3,3 0,12 -3,3 -12,0 -3,-3"
        opacity="${p.op}"
      />
    `).join('');
  }
  
  function getCelestialIconSvgMarkup(type) {
    if (type === 'constellation') {
      return `
        <g class="celestial-display-icon" transform="scale(0.85)">
          <g transform="translate(-45, -40)">
            <polyline points="0,55 35,10 65,42 52,85 0,55" fill="rgba(255,255,255,0.12)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="35" y1="10" x2="68" y2="2" stroke="#ffffff" stroke-dasharray="6,6" stroke-width="3"/>
            <line x1="68" y1="2" x2="92" y2="-6" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
            <circle cx="0" cy="55" r="8" fill="#ffffff"/>
            <circle cx="35" cy="10" r="9" fill="#ffffff"/>
            <circle cx="65" cy="42" r="8" fill="#ffffff"/>
            <circle cx="52" cy="85" r="9" fill="#ffffff"/>
            <circle cx="92" cy="-6" r="8.5" fill="#ffffff"/>
            <polygon points="85,32 88,38 95,39 90,44 91,50 85,46 79,50 81,44 76,39 82,38" fill="#ffffff"/>
            <polygon points="80,72 82,77 88,78 83,82 85,88 80,84 74,88 76,82 71,78 77,77" fill="#ffffff"/>
          </g>
        </g>
      `;
    } else if (type === 'planet') {
      return `
        <g class="celestial-display-icon" transform="scale(0.95)">
          <ellipse cx="0" cy="0" rx="66" ry="26" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="14,10" transform="rotate(-30)" opacity="0.5"/>
          <circle cx="0" cy="0" r="40" fill="#0d1b2a" stroke="#ffffff" stroke-width="5"/>
          <path d="M -26,-26 A 40 40 0 0 1 26,26 Z" fill="rgba(255,255,255,0.18)"/>
          <path d="M -56,20 A 66 26 0 0 0 56,-20" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" transform="rotate(-30)"/>
        </g>
      `;
    } else if (type === 'galaxy') {
      return `
        <g class="celestial-display-icon" transform="scale(0.9)" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round">
          <circle cx="0" cy="0" r="10" fill="#ffffff"/>
          <path d="M 0,0 C 18,-12 40,-18 60,-6 C 72,0 76,18 70,34" />
          <path d="M 0,0 C -18,12 -40,18 -60,6 C -72,0 -76,-18 -70,-34" />
          <path d="M 0,0 C 12,18 18,40 6,60 C 0,72 -18,76 -34,70" />
          <path d="M 0,0 C -12,-18 -18,-40 -6,-60 C 0,-72 18,-76 34,-70" />
          <circle cx="40" cy="-32" r="3.5" fill="#ffffff" stroke="none"/>
          <circle cx="-40" cy="32" r="3.5" fill="#ffffff" stroke="none"/>
          <circle cx="32" cy="40" r="3" fill="#ffffff" stroke="none"/>
          <circle cx="-32" cy="-40" r="3" fill="#ffffff" stroke="none"/>
        </g>
      `;
    } else if (type === 'blackhole') {
      return `
        <g class="celestial-display-icon" transform="scale(0.88)">
          <g stroke="#ffffff" stroke-width="3.5" fill="none" opacity="0.9">
            <path d="M -16,-22 Q -45,-50 -68,-16 Q -45,6 -22,16" />
            <path d="M 22,-16 Q 50,-45 16,-68 Q -6,-45 -16,-22" />
            <path d="M 16,22 Q 45,50 68,16 Q 45,-6 22,-16" />
            <path d="M -22,16 Q -50,45 -16,68 Q 6,45 16,22" />
          </g>
          <circle cx="0" cy="0" r="30" fill="#050608" stroke="#ffffff" stroke-width="5"/>
          <circle cx="0" cy="0" r="18" fill="#000000"/>
          <polygon points="-52,-52 -50,-47 -45,-46 -49,-43 -47,-38 -52,-41 -57,-38 -55,-43 -59,-46 -54,-47" fill="#ffffff"/>
          <polygon points="52,52 50,47 45,46 49,43 47,38 52,41 57,38 55,43 59,46 54,47" fill="#ffffff"/>
        </g>
      `;
    } else {
      return `
        <g class="cosmic-white-wall">
          <circle cx="0" cy="0" r="72" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="10,6" opacity="0.6"/>
          <circle cx="0" cy="0" r="54" fill="#ffffff" stroke="#ffffff" stroke-width="4"/>
        </g>
      `;
    }
  }
  
  async function runStargazerObservation(tl, outcomeType, outcomeTitle) {
    targetUnit.style.display = 'none';
    skillName.innerText = '【天體觀測・深空探索】';
    strip.classList.add('active');
    skillName.classList.add('active');
    await tl.wait(250);
  
    sfx.play('focus');
    const { cx, cy } = getStageCenter();
  
    fx.innerHTML = `
      <g transform="translate(${cx}, ${cy})">
        <g id="ambientStarsGroup">${getAmbientStarsMarkup()}</g>
        <g id="stargazerReticle" class="stargazer-reticle-frame" fill="none" stroke-linecap="square">
          <polyline points="-60,-35 -60,-60 -35,-60" stroke-width="3"/>
          <polyline points="35,-60 60,-60 60,-35" stroke-width="3"/>
          <polyline points="60,35 60,60 35,60" stroke-width="3"/>
          <polyline points="-35,60 -60,60 -60,35" stroke-width="3"/>
        </g>
        <g id="starFlareNode" style="transform-origin: 0px 0px; opacity: 1; transition: opacity ${tl.sec(0.25)} ease-out, transform ${tl.sec(0.35)} ease-out;">
          <polygon class="stargazer-star-flare" points="0,-22 4.5,-4.5 22,0 4.5,4.5 0,22 -4.5,4.5 -22,0 -4.5,-4.5"/>
          <circle cx="0" cy="0" r="3.5" fill="#ffffff"/>
        </g>
        <g id="celestialSlot"></g>
      </g>
    `;
  
    await tl.wait(400);
  
    const flareNode = document.getElementById('starFlareNode');
    if (flareNode) {
      flareNode.style.transform = 'scale(2.2)';
      flareNode.style.opacity = '0';
    }
    await tl.wait(260);
    if (flareNode) flareNode.remove();
  
    const reticleNode = document.getElementById('stargazerReticle');
    if (outcomeType === 'boundary') {
      if (reticleNode) reticleNode.remove();
      sfx.play('barrier_hit');
    } else if (outcomeType === 'blackhole') {
      sfx.play('heavy_impact');
    } else {
      sfx.play('snap');
    }
  
    actorStatus.innerText = outcomeTitle;
    actorStatus.style.opacity = '1';
  
    const slot = document.getElementById('celestialSlot');
    if (slot) slot.innerHTML = getCelestialIconSvgMarkup(outcomeType);
  
    await tl.wait(900);
    strip.classList.remove('active');
    skillName.classList.remove('active');
  }
  
  // ==========================================
  // 9. 觀星者：【星軌干涉・時計重塑】核心動態引擎 (長曝光星軌 + 四向分支)
  // ==========================================
  async function runOrbitReshapeEvent(tl, eventType) {
    targetUnit.style.display = 'none'; // 全隊輔助，無目標 Boss
    skillName.innerText = '【星軌干涉・時計重塑】';
    strip.classList.add('active');
    skillName.classList.add('active');
    await tl.wait(250);
  
    sfx.play('focus');
    const { cx, cy } = getStageCenter();
  
    // 1. 建立渾天星軌基底 (3 道傾斜軌道環 + 方位盤 + 長曝光星軌層)
    fx.innerHTML = `
      <g transform="translate(${cx}, ${cy})">
        <g id="ambientStarsGroup">${getAmbientStarsMarkup()}</g>
  
        <!-- 渾天儀經緯方位盤刻度 (青色) -->
        <g stroke="var(--cyan)" stroke-width="1" opacity="0.4" fill="none">
          <circle cx="0" cy="0" r="145" stroke-dasharray="4,8"/>
          <line x1="-155" y1="0" x2="155" y2="0" stroke-dasharray="2,6"/>
          <line x1="0" y1="-155" x2="0" y2="155" stroke-dasharray="2,6"/>
          <polygon points="0,-148 4,-142 -4,-142" fill="var(--cyan)"/>
          <polygon points="0,148 4,142 -4,142" fill="var(--cyan)"/>
          <polygon points="-148,0 -142,4 -142,-4" fill="var(--cyan)"/>
          <polygon points="148,0 142,4 142,-4" fill="var(--cyan)"/>
        </g>
  
        <!-- 3 道立體傾斜公轉軌道基底環 -->
        <g id="orbitRingsBase">
          <ellipse class="orbit-ring" cx="0" cy="0" rx="60" ry="34" transform="rotate(-15)"/>
          <ellipse class="orbit-ring" cx="0" cy="0" rx="100" ry="56" transform="rotate(25)"/>
          <ellipse class="orbit-ring" cx="0" cy="0" rx="140" ry="78" transform="rotate(-38)"/>
        </g>
  
        <!-- 動態長曝光星軌光弧 -->
        <path id="trail1" class="orbit-trail" stroke-width="2.4" />
        <path id="trail2" class="orbit-trail" stroke-width="2.8" />
        <path id="trail3" class="orbit-trail" stroke-width="3.2" />
  
        <!-- 3 顆核心公轉星體 -->
        <circle id="star1" class="orbit-node" r="4.5" />
        <circle id="star2" class="orbit-node" r="5.5" />
        <circle id="star3" class="orbit-node" r="6.5" />
  
        <!-- 爆發/重置特效插槽 -->
        <g id="orbitEventSlot"></g>
      </g>
    `;
  
    const trail1 = document.getElementById('trail1');
    const trail2 = document.getElementById('trail2');
    const trail3 = document.getElementById('trail3');
    const star1 = document.getElementById('star1');
    const star2 = document.getElementById('star2');
    const star3 = document.getElementById('star3');
    const eventSlot = document.getElementById('orbitEventSlot');
  
    // ----------------------------------------------------
    // 前置動畫：星軌長曝光流動 (向前差速公轉蓄能，36 影格)
    // ----------------------------------------------------
    sfx.play('blade_spin');
    const preFrames = 36;
    let curAngle1 = 0;
    let curAngle2 = 0;
    let curAngle3 = 0;
  
    for (let f = 0; f <= preFrames; f++) {
      if (tl.isAborted) return;
      const p = f / preFrames;
      const trailSpan = Math.min(p * 2.2, 1) * Math.PI * 1.1;
  
      curAngle1 = p * Math.PI * 5.5;
      curAngle2 = -p * Math.PI * 4.0;
      curAngle3 = p * Math.PI * 2.6;
  
      const p1 = getOrbitPos(60, 34, -15, curAngle1);
      const p2 = getOrbitPos(100, 56, 25, curAngle2);
      const p3 = getOrbitPos(140, 78, -38, curAngle3);
  
      star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
      star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
      star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);
  
      trail1.setAttribute('d', generateArcPath(60, 34, -15, curAngle1, trailSpan));
      trail2.setAttribute('d', generateArcPath(100, 56, 25, curAngle2, -trailSpan));
      trail3.setAttribute('d', generateArcPath(140, 78, -38, curAngle3, trailSpan));
  
      await tl.wait(14);
    }
  
    // ----------------------------------------------------
    // 分支演出：4 種時空干涉結果
    // ----------------------------------------------------
    switch (eventType) {
      // ----------------------------------------------------
      // 事件 A：【軌道微調】(70%) - 星星優雅往回轉半圈 (180° / π rad)
      // ----------------------------------------------------
      case 'minor_shift': {
        sfx.play('snap');
        const rewindFrames = 26;
        const startA1 = curAngle1;
        const startA2 = curAngle2;
        const startA3 = curAngle3;
  
        for (let f = 0; f <= rewindFrames; f++) {
          if (tl.isAborted) return;
          const p = f / rewindFrames;
          const ease = Math.sin((p * Math.PI) / 2);
  
          const a1 = startA1 - ease * Math.PI;
          const a2 = startA2 + ease * Math.PI;
          const a3 = startA3 - ease * Math.PI;
  
          const span = (1 - p * 0.4) * Math.PI * 0.9;
  
          const p1 = getOrbitPos(60, 34, -15, a1);
          const p2 = getOrbitPos(100, 56, 25, a2);
          const p3 = getOrbitPos(140, 78, -38, a3);
  
          star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
          star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
          star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);
  
          trail1.setAttribute('d', generateArcPath(60, 34, -15, a1, -span));
          trail2.setAttribute('d', generateArcPath(100, 56, 25, a2, span));
          trail3.setAttribute('d', generateArcPath(140, 78, -38, a3, -span));
  
          await tl.wait(14);
        }
  
        eventSlot.innerHTML = `
          <circle cx="0" cy="0" r="30" fill="none" stroke="#ffffff" stroke-width="2.5">
            <animate attributeName="r" values="30;140" dur="${tl.sec(0.55)}" fill="freeze" />
            <animate attributeName="opacity" values="1;0" dur="${tl.sec(0.55)}" fill="freeze" />
          </circle>
        `;
  
        actorStatus.innerText = '【軌道微調・CD -1】';
        actorStatus.style.opacity = '1';
        await tl.wait(750);
        break;
      }
  
      // ----------------------------------------------------
      // 事件 B：【超新星重啟】(10%) - 星星激昂倒轉一整圈 (360° / 2π)，純白衝擊波爆散（無大星星）
      // ----------------------------------------------------
      case 'supernova': {
        sfx.play('blade_spin');
        const fullRewindFrames = 30;
        const startA1 = curAngle1;
        const startA2 = curAngle2;
        const startA3 = curAngle3;
  
        for (let f = 0; f <= fullRewindFrames; f++) {
          if (tl.isAborted) return;
          const p = f / fullRewindFrames;
          const ease = p * p;
  
          const a1 = startA1 - ease * Math.PI * 2;
          const a2 = startA2 + ease * Math.PI * 2;
          const a3 = startA3 - ease * Math.PI * 2;
  
          const span = Math.PI * 1.4;
  
          const p1 = getOrbitPos(60, 34, -15, a1);
          const p2 = getOrbitPos(100, 56, 25, a2);
          const p3 = getOrbitPos(140, 78, -38, a3);
  
          star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
          star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
          star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);
  
          trail1.setAttribute('d', generateArcPath(60, 34, -15, a1, -span));
          trail2.setAttribute('d', generateArcPath(100, 56, 25, a2, span));
          trail3.setAttribute('d', generateArcPath(140, 78, -38, a3, -span));
  
          await tl.wait(14);
        }
  
        // 抵達歸零點，純淨白熱衝擊波擴散（已移除大星星本體）
        sfx.play('heavy_impact');
        eventSlot.innerHTML = `
          <circle class="supernova-shockwave" cx="0" cy="0" r="10">
            <animate attributeName="r" values="10;175" dur="${tl.sec(0.45)}" fill="freeze" />
            <animate attributeName="opacity" values="1;0" dur="${tl.sec(0.45)}" fill="freeze" />
          </circle>
          <circle class="supernova-shockwave" cx="0" cy="0" r="5" stroke-dasharray="8,6" opacity="0.8">
            <animate attributeName="r" values="5;130" dur="${tl.sec(0.35)}" fill="freeze" />
            <animate attributeName="opacity" values="0.8;0" dur="${tl.sec(0.35)}" fill="freeze" />
          </circle>
        `;
  
        actorStatus.innerText = '【超新星重啟・CD 歸零】';
        actorStatus.style.opacity = '1';
        await tl.wait(900);
        break;
      }
  
      // ----------------------------------------------------
      // 事件 C：【過載躍遷】(10%) - 星星往後顫動縮回一點點，接著瞬間爆裂往前狂飆！
      // ----------------------------------------------------
      case 'overload': {
        sfx.play('overload_glitch');
        trail1.setAttribute('stroke', '#fc8181');
        trail2.setAttribute('stroke', '#fc8181');
        trail3.setAttribute('stroke', '#fc8181');
  
        for (let f = 0; f < 8; f++) {
          if (tl.isAborted) return;
          const joltA1 = curAngle1 - 0.35 + (Math.random() - 0.5) * 0.15;
          const joltA2 = curAngle2 + 0.35 + (Math.random() - 0.5) * 0.15;
          const joltA3 = curAngle3 - 0.35 + (Math.random() - 0.5) * 0.15;
  
          const p1 = getOrbitPos(60, 34, -15, joltA1);
          const p2 = getOrbitPos(100, 56, 25, joltA2);
          const p3 = getOrbitPos(140, 78, -38, joltA3);
  
          star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
          star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
          star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);
  
          await tl.wait(16);
        }
  
        sfx.play('slash');
        const snapA1 = curAngle1 + 1.8;
        const snapA2 = curAngle2 - 1.8;
        const snapA3 = curAngle3 + 1.8;
  
        const p1 = getOrbitPos(60, 34, -15, snapA1);
        const p2 = getOrbitPos(100, 56, 25, snapA2);
        const p3 = getOrbitPos(140, 78, -38, snapA3);
  
        star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
        star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
        star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);
  
        trail1.setAttribute('stroke', '#ffffff');
        trail2.setAttribute('stroke', '#ffffff');
        trail3.setAttribute('stroke', '#ffffff');
        trail1.setAttribute('d', generateArcPath(60, 34, -15, snapA1, Math.PI * 1.5));
        trail2.setAttribute('d', generateArcPath(100, 56, 25, snapA2, -Math.PI * 1.5));
        trail3.setAttribute('d', generateArcPath(140, 78, -38, snapA3, Math.PI * 1.5));
  
        eventSlot.innerHTML = `
          <g class="overload-arc">
            <path d="M ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y}" />
          </g>
        `;
  
        actorStatus.innerText = '【過載躍遷・傷+5 / CD+1】';
        actorStatus.style.opacity = '1';
        await tl.wait(850);
        break;
      }
  
      // ----------------------------------------------------
      // 事件 D：【星軌虛耗】(10%) - 星星失去引力向下墜出星軌外消失
      // ----------------------------------------------------
      case 'whiff': {
        sfx.play('whiff_drop');
        trail1.setAttribute('d', '');
        trail2.setAttribute('d', '');
        trail3.setAttribute('d', '');
  
        const startP1 = getOrbitPos(60, 34, -15, curAngle1);
        const startP2 = getOrbitPos(100, 56, 25, curAngle2);
        const startP3 = getOrbitPos(140, 78, -38, curAngle3);
  
        const ringsBase = document.getElementById('orbitRingsBase');
        if (ringsBase) {
          ringsBase.style.transition = `opacity ${tl.sec(0.35)}`;
          ringsBase.style.opacity = '0.15';
        }
  
        const dropFrames = 24;
        for (let f = 0; f <= dropFrames; f++) {
          if (tl.isAborted) return;
          const p = f / dropFrames;
          const dropDist = p * p * 150;
          const op = (1 - p).toFixed(2);
  
          star1.setAttribute('cy', startP1.y + dropDist);
          star2.setAttribute('cy', startP2.y + dropDist * 1.15);
          star3.setAttribute('cy', startP3.y + dropDist * 1.3);
  
          star1.style.opacity = op;
          star2.style.opacity = op;
          star3.style.opacity = op;
  
          await tl.wait(14);
        }
  
        star1.remove();
        star2.remove();
        star3.remove();
  
        actorStatus.innerText = '【星軌虛耗・星辰脫軌】';
        actorStatus.style.opacity = '1';
        await tl.wait(750);
        break;
      }
    }
  
    strip.classList.remove('active');
    skillName.classList.remove('active');
  }
  
  // ==========================================
  // 10. 技能資料庫
  // ==========================================
  const SKILL_DATABASE = {
    stargazer: {
      name: '觀星者',
      portrait: PORTRAIT_ASSETS.stargazer,
      skills: {
        orbit_shift: {
          label: '【星軌干涉】(事件1：軌道微調・回轉半圈)',
          runner: async (tl) => {
            await runOrbitReshapeEvent(tl, 'minor_shift');
          }
        },
        orbit_supernova: {
          label: '【星軌干涉】(事件2：超新星重啟・倒轉一圈)',
          runner: async (tl) => {
            await runOrbitReshapeEvent(tl, 'supernova');
          }
        },
        orbit_overload: {
          label: '【星軌干涉】(事件3：過載躍遷・後縮驟前)',
          runner: async (tl) => {
            await runOrbitReshapeEvent(tl, 'overload');
          }
        },
        orbit_whiff: {
          label: '【星軌干涉】(事件4：星軌虛耗・脫軌墜落)',
          runner: async (tl) => {
            await runOrbitReshapeEvent(tl, 'whiff');
          }
        },
        orbit_rng: {
          label: '【星軌干涉】(🎲 隨機機率抽選)',
          runner: async (tl) => {
            const rand = Math.random() * 100;
            if (rand < 70) {
              await runOrbitReshapeEvent(tl, 'minor_shift');
            } else if (rand < 80) {
              await runOrbitReshapeEvent(tl, 'supernova');
            } else if (rand < 90) {
              await runOrbitReshapeEvent(tl, 'overload');
            } else {
              await runOrbitReshapeEvent(tl, 'whiff');
            }
          }
        },
        constellation: {
          label: '【天體觀測・深空探索】(發現星座)',
          runner: async (tl) => {
            await runStargazerObservation(tl, 'constellation', '【發現星座】');
          }
        },
        planet: {
          label: '【天體觀測・深空探索】(發現星球)',
          runner: async (tl) => {
            await runStargazerObservation(tl, 'planet', '【發現星球】');
          }
        },
        galaxy: {
          label: '【天體觀測・深空探索】(發現星系)',
          runner: async (tl) => {
            await runStargazerObservation(tl, 'galaxy', '【發現星系】');
          }
        },
        blackhole: {
          label: '【天體觀測・深空探索】(發現黑洞)',
          runner: async (tl) => {
            await runStargazerObservation(tl, 'blackhole', '【發現黑洞】');
          }
        },
        boundary: {
          label: '【天體觀測・深空探索】(發現宇宙邊界・圓形白牆)',
          runner: async (tl) => {
            await runStargazerObservation(tl, 'boundary', '【發現宇宙邊界】');
          }
        }
      }
    },
  
    dreamweaver: {
      name: '織夢術士',
      portrait: PORTRAIT_ASSETS.dreamweaver,
      skills: {
        butterfly_sink: {
          label: '【清醒夢・薛丁格之蝶】(四蝶錯開・U字波浪長絲・四蝶入體)',
          runner: async (tl) => {
            skillName.innerText = '【清醒夢・薛丁格之蝶】';
            strip.classList.add('active');
            skillName.classList.add('active');
            await tl.wait(250);
  
            sfx.play('flutter');
            const aPos = getCenter(actorHit);
            const tPos = getCenter(targetHit);
  
            const midX = (aPos.x + tPos.x) / 2;
            const midY = (aPos.y + tPos.y) / 2;
  
            const butterflies = [
              createButterflyNode(aPos.x - 12, aPos.y - 18, 0.3, -20),
              createButterflyNode(aPos.x + 12, aPos.y - 18, 0.3, 20),
              createButterflyNode(aPos.x - 15, aPos.y + 18, 0.3, -40),
              createButterflyNode(aPos.x + 15, aPos.y + 18, 0.3, 40)
            ];
            butterflies.forEach(b => fx.appendChild(b));
  
            const threadA = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            threadA.setAttribute('class', 'dream-thread');
            const threadB = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            threadB.setAttribute('class', 'dream-thread');
            fx.appendChild(threadA);
            fx.appendChild(threadB);
  
            const weaveFrames = 58;
            let lastBPositions = [];
  
            for (let step = 0; step <= weaveFrames; step++) {
              if (tl.isAborted) return;
              const p = step / weaveFrames;
  
              const centerX = aPos.x + (midX - aPos.x) * Math.min(p * 1.35, 1);
              const centerY = aPos.y + (midY - aPos.y) * Math.min(p * 1.35, 1);
  
              const tA = p * Math.PI * 4.2;
              const spreadA = 135 * Math.sin(p * Math.PI);
              const b1x = centerX + spreadA * Math.cos(tA) - 25;
              const b1y = centerY + (spreadA * 0.55) * Math.sin(2 * tA) - 45;
              const b2x = centerX - spreadA * Math.cos(tA + 0.35) + 25;
              const b2y = centerY - (spreadA * 0.55) * Math.sin(2 * tA + 0.35) + 25;
  
              const tB = -p * Math.PI * 3.4 + 1.4;
              const spreadB = 120 * Math.sin(p * Math.PI);
              const b3x = centerX + (spreadB * 0.7) * Math.sin(tB) + 30;
              const b3y = centerY + spreadB * Math.cos(tB * 1.1) + 20;
              const b4x = centerX - (spreadB * 0.7) * Math.sin(tB - 0.45) - 30;
              const b4y = centerY - spreadB * Math.cos((tB - 0.45) * 1.1) - 40;
  
              butterflies[0].setAttribute('transform', `translate(${b1x}, ${b1y}) rotate(${tA * 45}) scale(0.3)`);
              butterflies[1].setAttribute('transform', `translate(${b2x}, ${b2y}) rotate(${tA * 45 + 180}) scale(0.3)`);
              butterflies[2].setAttribute('transform', `translate(${b3x}, ${b3y}) rotate(${-tB * 45}) scale(0.3)`);
              butterflies[3].setAttribute('transform', `translate(${b4x}, ${b4y}) rotate(${-tB * 45 + 180}) scale(0.3)`);
  
              threadA.setAttribute('d', getTwistedUPath(b1x, b1y, b2x, b2y, step, 0));
              threadB.setAttribute('d', getTwistedUPath(b3x, b3y, b4x, b4y, step, 2.8));
  
              lastBPositions = [
                { x: b1x, y: b1y },
                { x: b2x, y: b2y },
                { x: b3x, y: b3y },
                { x: b4x, y: b4y }
              ];
  
              await tl.wait(14);
            }
  
            sfx.play('focus');
            const rushFrames = 28;
  
            for (let step = 0; step <= rushFrames; step++) {
              if (tl.isAborted) return;
              const p = step / rushFrames;
              const ease = p * p;
  
              const curPositions = lastBPositions.map(start => ({
                x: start.x + (tPos.x - start.x) * ease,
                y: start.y + (tPos.y - start.y) * ease
              }));
  
              const curScale = 0.3 * (1 - p * 0.85);
              const curOpacity = (1 - p).toFixed(2);
  
              curPositions.forEach((pos, idx) => {
                butterflies[idx].setAttribute('transform', `translate(${pos.x}, ${pos.y}) rotate(${p * 450}) scale(${curScale})`);
                butterflies[idx].style.opacity = curOpacity;
              });
  
              threadA.setAttribute('d', getTwistedUPath(curPositions[0].x, curPositions[0].y, curPositions[1].x, curPositions[1].y, weaveFrames + step, 0));
              threadA.style.opacity = curOpacity;
  
              threadB.setAttribute('d', getTwistedUPath(curPositions[2].x, curPositions[2].y, curPositions[3].x, curPositions[3].y, weaveFrames + step, 2.8));
              threadB.style.opacity = curOpacity;
  
              await tl.wait(13);
            }
  
            fx.innerHTML = '';
            targetHit.classList.add('flinch-down');
  
            targetStatus.innerText = '【夢蝶迷思】';
            targetStatus.style.opacity = '1';
            await tl.wait(650);
  
            targetHit.className = 'hit-wrapper';
            strip.classList.remove('active');
            skillName.classList.remove('active');
          }
        },
  
        constrict_slash: {
          label: '【恍惚編織】(螺旋纏繞・四散勒緊・頭像擠壓)',
          runner: async (tl) => {
            skillName.innerText = '【恍惚編織】';
            strip.classList.add('active');
            skillName.classList.add('active');
            await tl.wait(250);
  
            sfx.play('flutter');
            const tPos = getCenter(targetHit);
            const aPos = getCenter(actorHit);
  
            const bOffsets = [
              { x: -75, y: -65, angle: -45 },
              { x: 75,  y: -65, angle: 45 },
              { x: 75,  y: 65,  angle: 135 },
              { x: -75, y: 65,  angle: -135 }
            ];
  
            const butterflies = bOffsets.map(o => {
              const node = createButterflyNode(aPos.x, aPos.y, 0.38, o.angle);
              node.style.transition = `all ${tl.sec(0.38)} cubic-bezier(0.2, 0.8, 0.3, 1)`;
              fx.appendChild(node);
              return node;
            });
  
            await tl.wait(40);
  
            butterflies.forEach((b, i) => {
              const bx = tPos.x + bOffsets[i].x;
              const by = tPos.y + bOffsets[i].y;
              b.setAttribute('transform', `translate(${bx}, ${by}) rotate(${bOffsets[i].angle}) scale(0.45)`);
            });
  
            const coilConfigs = [
              { rx: 65, ry: 38, rot: -28 },
              { rx: 58, ry: 32, rot: 32 },
              { rx: 64, ry: 42, rot: 2 }
            ];
  
            const coils = coilConfigs.map(c => {
              const ell = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
              ell.setAttribute('class', 'dream-coil');
              ell.setAttribute('cx', tPos.x);
              ell.setAttribute('cy', tPos.y);
              ell.setAttribute('rx', c.rx);
              ell.setAttribute('ry', c.ry);
              ell.setAttribute('transform', `rotate(${c.rot} ${tPos.x} ${tPos.y})`);
              ell.style.transition = `all ${tl.sec(0.35)} cubic-bezier(0.2, 0.8, 0.3, 1)`;
              fx.appendChild(ell);
              return ell;
            });
  
            await tl.wait(400);
  
            const outerPull = [
              { x: -160, y: -140, angle: -135 },
              { x: 160,  y: -140, angle: -45 },
              { x: 160,  y: 140,  angle: 45 },
              { x: -160, y: 140,  angle: 135 }
            ];
  
            const pullLines = [0, 1, 2, 3].map(() => {
              const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              l.setAttribute('class', 'dream-coil tension');
              fx.appendChild(l);
              return l;
            });
  
            butterflies.forEach((b, i) => {
              b.style.transition = `all ${tl.sec(0.24)} cubic-bezier(0.7, 0, 1, 1)`;
              const bx = tPos.x + outerPull[i].x;
              const by = tPos.y + outerPull[i].y;
              b.setAttribute('transform', `translate(${bx}, ${by}) rotate(${outerPull[i].angle}) scale(0.55)`);
  
              pullLines[i].setAttribute('x1', tPos.x + outerPull[i].x);
              pullLines[i].setAttribute('y1', tPos.y + outerPull[i].y);
              pullLines[i].setAttribute('x2', tPos.x);
              pullLines[i].setAttribute('y2', tPos.y);
            });
  
            coils.forEach(ell => {
              ell.setAttribute('class', 'dream-coil tension');
              ell.style.transition = `all ${tl.sec(0.24)} cubic-bezier(0.7, 0, 1, 1)`;
              ell.setAttribute('rx', 14);
              ell.setAttribute('ry', 9);
            });
  
            targetHit.style.transition = `transform ${tl.sec(0.24)} cubic-bezier(0.7, 0, 1, 1)`;
            targetHit.style.transform = 'scale(0.8)';
  
            sfx.play('snap');
            await tl.wait(240);
  
            fx.innerHTML = '';
            targetHit.style.transition = `transform ${tl.sec(0.12)} cubic-bezier(0.18, 0.89, 0.32, 1.28)`;
            targetHit.style.transform = 'scale(1.0)';
            targetHit.classList.add('shake-micro');
  
            sfx.play('heavy_impact');
            showDamage(tPos.x - 12, tPos.y - 65, '-18');
            await tl.wait(80);
            targetHp.style.width = '72%';
  
            await tl.wait(600);
            targetHit.style.transform = '';
            targetHit.className = 'hit-wrapper';
            strip.classList.remove('active');
            skillName.classList.remove('active');
          }
        }
      }
    },
  
    gladiator: {
      name: '角鬥士',
      portrait: PORTRAIT_ASSETS.gladiator,
      skills: {
        issue_challenge: {
          label: '【發出挑戰書】(羅馬短劍・拋物線・劍柄立於Boss身側)',
          runner: async (tl) => {
            skillName.innerText = '【發出挑戰書】';
            strip.classList.add('active');
            skillName.classList.add('active');
            await tl.wait(250);
  
            const aPos = getCenter(actorHit);
            const tPos = getCenter(targetHit);
  
            sfx.play('slash');
            actorPos.style.transition = `transform ${tl.sec(0.18)} ease-out`;
            actorPos.style.transform = 'translateY(6px)';
            await tl.wait(180);
  
            const startX = aPos.x + 35;
            const startY = aPos.y - 10;
            const endX = tPos.x - 85;
            const groundY = tPos.y + 38;
  
            const swordNode = createGladiusNode(0.6);
            fx.appendChild(swordNode);
  
            sfx.play('blade_spin');
  
            const totalFrames = 42;
            const arcHeight = -140;
  
            for (let step = 0; step <= totalFrames; step++) {
              if (tl.isAborted) return;
              const p = step / totalFrames;
  
              const curX = startX + (endX - startX) * p;
              const curY = startY + (groundY - startY) * p + arcHeight * Math.sin(p * Math.PI);
  
              const curAngle = (p < 0.88) ? (p * 720) : (720 * 0.88 + (p - 0.88) * (145 - 720 * 0.88) / 0.12);
  
              swordNode.setAttribute('transform', `translate(${curX}, ${curY}) rotate(${curAngle})`);
              await tl.wait(14);
            }
  
            const clipId = 'groundClip_' + Date.now();
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defs.innerHTML = `
              <clipPath id="${clipId}">
                <rect x="-2000" y="-2000" width="6000" height="${2000 + groundY}" />
              </clipPath>
            `;
            fx.appendChild(defs);
  
            const groundClippedGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            groundClippedGroup.setAttribute('clip-path', `url(#${clipId})`);
            fx.appendChild(groundClippedGroup);
  
            groundClippedGroup.appendChild(swordNode);
            swordNode.setAttribute('transform', `translate(${endX}, ${groundY + 12}) rotate(145)`);
  
            const fissure = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            fissure.setAttribute('class', 'arena-fissure');
            fissure.setAttribute('d', `
              M ${endX} ${groundY} L ${endX - 22} ${groundY + 6}
              M ${endX} ${groundY} L ${endX + 16} ${groundY + 5}
              M ${endX} ${groundY} L ${endX - 4} ${groundY + 14}
            `);
            fx.appendChild(fissure);
  
            sfx.play('heavy_impact');
  
            targetHit.classList.add('flinch-down');
            targetStatus.innerText = '【生死挑戰】';
            targetStatus.style.opacity = '1';
  
            await tl.wait(850);
  
            actorPos.style.transform = '';
            targetHit.className = 'hit-wrapper';
            strip.classList.remove('active');
            skillName.classList.remove('active');
          }
        }
      }
    }
  };
  
  // ==========================================
  // 11. 選單初始化與事件監聽
  // ==========================================
  const classSelect = document.getElementById('classSelect');
  const skillSelect = document.getElementById('skillSelect');
  
  function populateClassMenu() {
    classSelect.innerHTML = '';
    Object.keys(SKILL_DATABASE).forEach(cKey => {
      const opt = document.createElement('option');
      opt.value = cKey;
      opt.innerText = SKILL_DATABASE[cKey].name;
      classSelect.appendChild(opt);
    });
    updateSkillMenu();
  }
  
  function updateSkillMenu() {
    const currentClass = SKILL_DATABASE[classSelect.value];
    skillSelect.innerHTML = '';
    Object.keys(currentClass.skills).forEach(sKey => {
      const opt = document.createElement('option');
      opt.value = sKey;
      opt.innerText = currentClass.skills[sKey].label;
      skillSelect.appendChild(opt);
    });
    setupPortraits();
  }
  
  function setupPortraits() {
    resetStageElements();
    const cData = SKILL_DATABASE[classSelect.value];
    actorPortrait.innerHTML = cData.portrait;
    actorName.innerText = cData.name;
    targetPortrait.innerHTML = PORTRAIT_ASSETS.boss;
  }
  
  async function playCurrentSkill() {
    resetStageElements();
    const cKey = classSelect.value;
    const sKey = skillSelect.value;
    const skillDef = SKILL_DATABASE[cKey]?.skills[sKey];
    if (!skillDef) return;
  
    const currentSpeed = parseFloat(speedSelect.value) || 0.5;
    setPlaybackState('playing');
    currentTimeline = new PresentationTimeline(currentSpeed);
  
    try {
      await skillDef.runner(currentTimeline);
      setPlaybackState('idle');
    } catch (err) {
      if (err.message !== 'ABORTED') {
        console.error(err);
      }
    }
  }
  
  classSelect.addEventListener('change', updateSkillMenu);
  skillSelect.addEventListener('change', () => resetStageElements());
  speedSelect.addEventListener('change', () => {
    syncWingSpeed();
    resetStageElements();
  });
  
  btnPlay.addEventListener('click', () => {
    if (currentTimeline && currentTimeline.isPaused) {
      currentTimeline.resume();
      setPlaybackState('playing');
    } else {
      playCurrentSkill();
    }
  });
  
  btnPause.addEventListener('click', () => {
    if (currentTimeline && !currentTimeline.isPaused) {
      currentTimeline.pause();
      setPlaybackState('paused');
    }
  });
  
  btnReplay.addEventListener('click', () => playCurrentSkill());
  btnReset.addEventListener('click', () => resetStageElements());
  
  // 初始化載入
  targetPortrait.innerHTML = PORTRAIT_ASSETS.boss;
  populateClassMenu();
  syncWingSpeed();