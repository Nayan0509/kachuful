// ─── Kachuful Game Engine ───────────────────────────────────────────────────
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

function maxRound(playerCount) {
  return Math.floor(52 / playerCount);
}

function dealRound(players, roundNumber) {
  const deck = shuffle(createDeck());
  const hands = {};
  players.forEach((p, i) => {
    hands[p.id] = deck.slice(i * roundNumber, (i + 1) * roundNumber);
  });
  const trumpCard = deck[players.length * roundNumber] || null;
  const trumpSuit = trumpCard ? trumpCard.suit : null;
  return { hands, trumpCard, trumpSuit };
}

function determineTrickWinner(trick, trumpSuit, leadSuit) {
  let winner = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const c = trick[i];
    const wCard = winner.card;
    const cCard = c.card;
    const wTrump = wCard.suit === trumpSuit;
    const cTrump = cCard.suit === trumpSuit;
    const wLead  = wCard.suit === leadSuit;
    const cLead  = cCard.suit === leadSuit;

    if (cTrump && !wTrump) { winner = c; continue; }
    if (!cTrump && wTrump)  continue;
    if (cTrump && wTrump) {
      if (cCard.value > wCard.value) winner = c;
      continue;
    }
    if (cLead && !wLead) { winner = c; continue; }
    if (!cLead && wLead)  continue;
    if (cCard.value > wCard.value) winner = c;
  }
  return winner.playerId;
}

function calcScore(bid, tricks) {
  if (bid === tricks) return bid === 0 ? 5 : 10 + bid * 2;
  return -Math.abs(bid - tricks) * 2;
}

module.exports = {
  createDeck, shuffle, maxRound, dealRound,
  determineTrickWinner, calcScore, SUITS, RANKS
};
