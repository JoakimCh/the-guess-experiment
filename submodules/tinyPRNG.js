
/** A CSPRNG which is consistent across all systems. */
export class PRNG {
  #aesKey; #iv; #blocksToBuffer
  #randomUint32s; #index

  constructor(blocksToBuffer = 256) {
    this.#blocksToBuffer = blocksToBuffer
    this.randomKey()
  }

  async randomKey(rawKey = crypto.getRandomValues(new Uint8Array(32))) {
    if (rawKey.byteLength != 32) throw Error('Key must be 256 bits.')
    this.#aesKey = await crypto.subtle.importKey(
      'raw', rawKey, {name: 'AES-CTR'}, false, ['encrypt']
    )
    this.#iv = new DataView(new ArrayBuffer(16)) // 16 bytes / 128 bits
    this.#randomUint32s = null
  }

  async uint32() {
    if (!this.#randomUint32s || this.#index == this.#randomUint32s.length) {
      if (!this.#aesKey) {
        await this.randomKey()
      }
      this.#randomUint32s = new Uint32Array(await crypto.subtle.encrypt(
        {
          name: 'AES-CTR',
          counter: this.#iv,
          length: 64 // bit-size of block counter in IV
        }, 
        this.#aesKey,
        new ArrayBuffer(16 * this.#blocksToBuffer)
      ))
      // increment the block counter to be correct for the next batch
      this.#iv.setBigUint64(8, this.#iv.getBigUint64(8) + BigInt(this.#blocksToBuffer))
      this.#index = 0 // reset
    }
    return this.#randomUint32s[this.#index++]
  }

  async integer(...range) {
    const min = range.length > 1 ? Math.round(Math.min(...range)) : 0
    const max = Math.round(Math.max(...range))
    return Math.floor(min + await this.float() * (max - min + 1))
  }

  async float(...range) {  
    const randomFloat = (await this.uint32() + (await this.uint32() >>> 11) * 2 ** 32) * 2 ** -53 // 0 to 0.9999999999999999
    let min
    switch (range.length) {
      case 0: return randomFloat
      case 1: min = 0; break
      default: min = Math.min(...range)
    }
    return min + randomFloat * (Math.max(...range) - min)
  }
}

// This one depends on the system since using crypto.getRandomValues
// export class PRNG {
//   #randomUint32s = new Uint32Array(1024)
//   #index = this.#randomUint32s.length
//   uint32() {
//     if (this.#index == this.#randomUint32s.length) {
//       crypto.getRandomValues(this.#randomUint32s)
//       this.#index = 0
//     }
//     return this.#randomUint32s[this.#index++]
//   }
//   integer(...range) {
//     const min = range.length > 1 ? Math.round(Math.min(...range)) : 0
//     const max = Math.round(Math.max(...range))
//     return Math.floor(min + this.float() * (max - min + 1))
//   }
//   float(...range) {  
//     const randomFloat = (this.uint32() + (this.uint32() >>> 11) * 2 ** 32) * 2 ** -53 // 0 to 0.9999999999999999
//     let min
//     switch (range.length) {
//       case 0: return randomFloat
//       case 1: min = 0; break
//       default: min = Math.min(...range)
//     }
//     return min + randomFloat * (Math.max(...range) - min)
//   }
// }
