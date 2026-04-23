// Generate a stable unique username from browser fingerprint
// Stored in localStorage so it persists across sessions

const ADJECTIVES = ['Swift','Bold','Clever','Lucky','Sharp','Brave','Sly','Wild','Cool','Calm'];
const NOUNS      = ['Fox','Ace','Wolf','King','Hawk','Bear','Lion','Rook','Jack','Duke'];

function browserSeed() {
  const nav = window.navigator;
  const parts = [
    nav.platform || '',
    nav.language || '',
    nav.hardwareConcurrency || '',
    screen.width + 'x' + screen.height,
    screen.colorDepth || '',
    Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  ];
  // Simple hash
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getOrCreateUsername() {
  const saved = localStorage.getItem('kachuful_name');
  if (saved && saved.trim()) return saved;

  const seed = browserSeed();
  const adj  = ADJECTIVES[seed % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(seed / ADJECTIVES.length) % NOUNS.length];
  // Add short random suffix to avoid collisions between same-device users
  const suffix = Math.floor(Math.random() * 900 + 100); // 3-digit
  const name = `${adj}${noun}${suffix}`;

  localStorage.setItem('kachuful_name', name);
  return name;
}

export function saveUsername(name) {
  localStorage.setItem('kachuful_name', name.trim());
}
