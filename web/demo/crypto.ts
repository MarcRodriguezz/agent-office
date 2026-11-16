export const randomUUID = () => crypto.randomUUID();

export const randomBytes = (size: number) => ({
  toString: () => [...crypto.getRandomValues(new Uint8Array(size))].map((b) => b.toString(16).padStart(2, '0')).join(''),
});
