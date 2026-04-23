const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, value: RANK_VALUE[rank] });
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function maxCardsPerRound(playerCount) {
  return Math.min(13, Math.floor(52 / playerCount));
}

function buildRoundSequence(playerCount) {
  const max = maxCardsPerRound(playerCount);
  const up   = Array.from({ length: max }, (_, i) => i + 1);
  const down = Array.from({ length: max - 1 }, (_, i) => max - 1 - i);
  return [...up, ...down];
}

function dealRound(players, roundNumber) {
  const deck = shuffle(createDeck());
  const hands = {};
  players.forEach((p, i) => {
    hands[p.id] = deck.slice(i * roundNumber, (i + 1) * roundNumber);
  });
  const trumpCard = deck[players.length * roundNumber] || null;
  return { hands, trumpCard, trumpSuit: trumpCard ? trumpCard.suit : null };
}

function determineTrickWinner(trick, trumpSuit, leadSuit) {
  let winner = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const c = trick[i], wCard = winner.card, cCard = c.card;
    const wT = wCard.suit === trumpSuit, cT = cCard.suit === trumpSuit;
    const wL = wCard.suit === leadSuit,  cL = cCard.suit === leadSuit;
    if (cT && !wT) { winner = c; continue; }
    if (!cT && wT) continue;
    if (cT && wT) { if (cCard.value > wCard.value) winner = c; continue; }
    if (cL && !wL) { winner = c; continue; }
    if (!cL && wL) continue;
    if (cCard.value > wCard.value) winner = c;
  }
  return winner.playerId;
}

function calcScore(bid, tricks) {
  if (bid === tricks) return 10 + tricks;
  return 0;
}

module.exports = { buildRoundSequence, dealRound, determineTrickWinner, calcScore };
