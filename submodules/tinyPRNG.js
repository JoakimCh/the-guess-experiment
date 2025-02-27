
export class PRNG {
  #randomUint32s = new Uint32Array(1024)
  #index = this.#randomUint32s.length
  uint32() {
    if (this.#index == this.#randomUint32s.length) {
      crypto.getRandomValues(this.#randomUint32s)
      this.#index = 0
    }
    return this.#randomUint32s[this.#index++]
  }
  integer(...range) {
    const min = range.length > 1 ? Math.round(Math.min(...range)) : 0
    const max = Math.round(Math.max(...range))
    return Math.floor(min + this.float() * (max - min + 1))
  }
  float(...range) {  
    const randomFloat = (this.uint32() + (this.uint32() >>> 11) * 2 ** 32) * 2 ** -53 // 0 to 0.9999999999999999
    let min
    switch (range.length) {
      case 0: return randomFloat
      case 1: min = 0; break
      default: min = Math.min(...range)
    }
    return min + randomFloat * (Math.max(...range) - min)
  }
}
