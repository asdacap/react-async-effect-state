/**
 * Simple utility that create a promise that delay its resolve by the specified delay.
 *
 * @param delayMs
 */
export default function waitPromise(delayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, delayMs);
  });
}
