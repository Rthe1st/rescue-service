const NAME_POOL: readonly string[] = [
  "Ava",
  "Ben",
  "Cleo",
  "Dax",
  "Ellie",
  "Finn",
  "Gwen",
  "Hugo",
  "Iris",
  "Jax",
  "Kira",
  "Leo",
  "Mira",
  "Noah",
  "Opal",
  "Pia",
  "Quinn",
  "Rex",
  "Sable",
  "Theo",
  "Uma",
  "Vic",
  "Wren",
  "Xander",
  "Yara",
  "Zane",
];

/**
 * Returns `count` player names drawn from a fixed pool in random order. Once the pool is
 * exhausted (more players than names), remaining players get numbered "Player N" names.
 */
export function generatePlayerNames(
  count: number,
  random: () => number = Math.random
): string[] {
  const shuffled = [...NAME_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a === undefined || b === undefined) continue;
    shuffled[i] = b;
    shuffled[j] = a;
  }

  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push(shuffled[i] ?? `Player ${String(i + 1)}`);
  }
  return names;
}
