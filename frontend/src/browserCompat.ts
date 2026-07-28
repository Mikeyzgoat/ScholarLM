const nativeStructuredClone = globalThis.structuredClone;

if (nativeStructuredClone) {
  globalThis.structuredClone = nativeStructuredClone.bind(globalThis);
}
